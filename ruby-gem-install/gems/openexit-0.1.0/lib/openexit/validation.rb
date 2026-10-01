require "json_schemer"
require "json"
module OpenExit
  module Validation
    module_function
    def load_schema(name)
      raise ArgumentError, "unknown PASP schema" unless SCHEMA_NAMES.include?(name)
      JSON.parse(File.read(File.join(__dir__, "schemas", "#{name}.schema.json"), encoding: "UTF-8"))
    end
    def validate_manifest(manifest)
      value = manifest.is_a?(Models::Manifest) ? manifest.raw : manifest
      raise PaspError.new("PASP_INVALID_MANIFEST", "manifest must be an object") unless value.is_a?(Hash)
      version = value["paspVersion"]
      raise PaspError.new("PASP_UNSUPPORTED_VERSION", "unsupported PASP version: #{version}") if version && version != PASP_VERSION
      required = %w[format paspVersion packageId exportId createdAt producer scope consistency resources assets integrity]
      raise PaspError.new("PASP_INVALID_MANIFEST", "missing required manifest field") unless required.all? { |k| value.key?(k) }
      raise PaspError.new("PASP_INVALID_MANIFEST", "invalid format") unless value["format"] == "openexit.bundle" && value["paspVersion"] == PASP_VERSION
      raise PaspError.new("PASP_INVALID_MANIFEST", "invalid producer/scope/consistency") unless value["producer"].is_a?(Hash) && value["scope"].is_a?(Hash) && value["consistency"].is_a?(Hash)
      raise PaspError.new("PASP_INVALID_MANIFEST", "invalid consistency") unless CONSISTENCY_LEVELS.include?(value.dig("consistency", "level"))
      seen = {}
      Array(value["resources"]).each do |entry|
        name = entry.is_a?(Hash) && entry["name"]
        raise PaspError.new("PASP_INVALID_RESOURCE", "invalid resource name") unless name.is_a?(String) && name.match?(/\A[A-Za-z0-9][A-Za-z0-9._-]{0,127}\z/)
        raise PaspError.new("PASP_DUPLICATE_RESOURCE", "duplicate resource: #{name}") if seen[name]
        seen[name] = true
        descriptor = entry["descriptor"]
        Paths.validate_package_path(descriptor)
        raise PaspError.new("PASP_INVALID_MANIFEST", "invalid descriptor") unless descriptor == "resources/#{name}/resource.json"
      end
      true
    rescue PaspError
      raise
    rescue StandardError => e
      raise PaspError.new("PASP_INVALID_MANIFEST", "invalid manifest", context: e)
    end
    def validate_document(name, value, code)
      case name
      when "resource"
        raise PaspError.new(code, "invalid resource") unless value.is_a?(Hash) && value["name"].is_a?(String) && value["schema"] && value["identity"].is_a?(Array) && value["recordCount"].is_a?(Integer) && value["chunks"].is_a?(Array)
      when "asset"
        raise PaspError.new(code, "invalid asset") unless value.is_a?(Hash) && value["id"].is_a?(String) && value["path"].is_a?(String) && value["sha256"].to_s.match?(/\A[a-f0-9]{64}\z/) && value["byteLength"].is_a?(Integer)
      when "relationship"
        raise PaspError.new(code, "invalid relationship") unless value.is_a?(Hash) && value["id"].is_a?(String) && %w[one-to-one one-to-many many-to-one many-to-many reference].include?(value["cardinality"]) && %w[from to].all? { |k| value[k].is_a?(Hash) && value[k]["resource"].is_a?(String) && value[k]["pointer"].is_a?(String) }
      end
      true
    end
  end
end
