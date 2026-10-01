require "json"
module OpenExit
  class Bundle
    attr_reader :path
    def initialize(path) = @path = File.expand_path(path.to_s)
    def self.open(path) = new(path)
    def inspect = OpenExit.inspect_bundle(path)
    def verify = OpenExit.verify_bundle(path)
  end
  module BundleOps
    module_function
    def json_file(path, code)
      JSON.parse(File.read(path, encoding: "UTF-8"))
    rescue StandardError => e
      raise PaspError.new(code, "invalid or missing JSON file: #{path}", context: e)
    end
    def lines(path, code)
      return enum_for(__method__, path, code) unless block_given?
      File.foreach(path, encoding: "UTF-8").with_index(1) do |line, number|
        next if line.strip.empty?
        begin value = JSON.parse(line); rescue JSON::ParserError => e; raise PaspError.new(code, "invalid NDJSON at #{path}:#{number}", context: e); end
        yield number, value
      end
    rescue SystemCallError, EncodingError => e
      raise PaspError.new(code, "cannot read NDJSON: #{path}", context: e)
    end
    def resource(root, entry, deep)
      name = entry["name"]
      descriptor_path = Paths.safe_path(root, entry["descriptor"])
      descriptor = json_file(descriptor_path, "PASP_INVALID_RESOURCE")
      Validation.validate_document("resource", descriptor, "PASP_INVALID_RESOURCE")
      raise PaspError.new("PASP_INVALID_RESOURCE", "descriptor name mismatch") unless descriptor["name"] == name
      schema = descriptor["schema"]
      if schema.is_a?(String)
        schema_path = Paths.safe_path(root, schema)
        raise PaspError.new("PASP_MISSING_SCHEMA", "missing schema: #{schema}") unless File.file?(schema_path)
        schema = json_file(schema_path, "PASP_MISSING_SCHEMA")
      end
      total = 0; chunks = []
      descriptor.fetch("chunks").each_with_index do |raw, index|
        expected = index + 1
        expected_path = "resources/#{name}/%08d.ndjson" % expected
        raise PaspError.new("PASP_INVALID_RESOURCE", "invalid chunk order/path") unless raw["sequence"] == expected && raw["path"] == expected_path
        chunk_path = Paths.safe_path(root, raw["path"])
        raise PaspError.new("PASP_INVALID_RESOURCE", "missing chunk") unless File.file?(chunk_path)
        if deep
          Integrity.verify_file(chunk_path, raw["sha256"], raw["uncompressedBytes"])
          count = 0
          lines(chunk_path, "PASP_INVALID_RECORD") do |line_no, record|
            raise PaspError.new("PASP_INVALID_RECORD", "record is not an object") unless record.is_a?(Hash)
            missing = Array(descriptor["identity"]).any? { |id| !record.key?(id) }
            raise PaspError.new("PASP_INVALID_RECORD", "missing identity at line #{line_no}") if missing
            count += 1
          end
          raise PaspError.new("PASP_INVALID_RESOURCE", "chunk record count mismatch") unless count == raw["recordCount"]
        end
        total += raw["recordCount"].to_i
        chunks << Models::ResourceChunk.new(sequence: raw["sequence"], path: raw["path"], record_count: raw["recordCount"], uncompressed_bytes: raw["uncompressedBytes"], sha256: raw["sha256"])
      end
      raise PaspError.new("PASP_INVALID_RESOURCE", "resource record count mismatch") unless total == descriptor["recordCount"]
      Models::Resource.new(name: name, schema: schema, identity: descriptor["identity"], record_count: descriptor["recordCount"], chunks: chunks, descriptor: entry["descriptor"])
    end
    def assets(root, raw, deep)
      count = raw["count"].to_i; total = raw["totalBytes"].to_i; index = raw["index"]
      return Models::AssetSummary.new(count: 0, total_bytes: 0, index: nil) if count == 0 && index.nil?
      index_path = Paths.safe_path(root, index || "assets/index.ndjson")
      raise PaspError.new("PASP_MISSING_ASSET", "missing asset index") unless File.file?(index_path)
      seen = 0; bytes = 0
      lines(index_path, "PASP_MISSING_ASSET") do |_n, asset|
        Validation.validate_document("asset", asset, "PASP_MISSING_ASSET")
        asset_path = Paths.safe_path(root, asset["path"])
        raise PaspError.new("PASP_MISSING_ASSET", "missing asset") unless File.file?(asset_path)
        Integrity.verify_file(asset_path, asset["sha256"], asset["byteLength"]) if deep
        seen += 1; bytes += asset["byteLength"]
      end
      raise PaspError.new("PASP_MISSING_ASSET", "asset summary mismatch") unless seen == count && bytes == total
      Models::AssetSummary.new(count: count, total_bytes: total, index: index)
    end
    def inspect_bundle(directory, deep)
      root = File.expand_path(directory.to_s)
      raise PaspError.new("PASP_MALFORMED_PACKAGE", "not a PASP directory") unless File.directory?(root)
      manifest_path = Paths.safe_path(root, "manifest.json")
      raise PaspError.new("PASP_MALFORMED_PACKAGE", "missing manifest.json") unless File.file?(manifest_path)
      manifest = Manifest.parse(Pathname.new(manifest_path)); Validation.validate_manifest(manifest)
      raw = manifest.raw; names = raw["resources"].map { |e| e["name"] }
      resources = raw["resources"].map { |e| resource(root, e, deep) }
      assets = assets(root, raw["assets"], deep)
      relationships = 0
      if raw["relationships"]
        rels = json_file(Paths.safe_path(root, raw["relationships"]), "PASP_INVALID_RELATIONSHIP")
        raise PaspError.new("PASP_INVALID_RELATIONSHIP", "relationships must be an array") unless rels.is_a?(Array)
        rels.each { |rel| Validation.validate_document("relationship", rel, "PASP_INVALID_RELATIONSHIP"); raise PaspError.new("PASP_INVALID_RELATIONSHIP", "missing endpoint resource") unless names.include?(rel.dig("from", "resource")) && names.include?(rel.dig("to", "resource")) }
        relationships = rels.length
      end
      Models::InspectionResult.new(valid: true, pasp_version: raw["paspVersion"], package_id: raw["packageId"], export_id: raw["exportId"], scope: Models::Scope.new(**raw["scope"].transform_keys(&:to_sym)), producer: Models::ProducerInfo.new(**raw["producer"].transform_keys(&:to_sym)), consistency: Models::Consistency.new(**raw["consistency"].transform_keys(&:to_sym)), resources: resources, assets: assets, relationships: relationships, integrity: Models::IntegrityInfo.new(**raw["integrity"].transform_keys(&:to_sym)))
    end
  end
end
