module OpenExit
  module Models
    Scope = Struct.new(:type, :id, :metadata, keyword_init: true)
    ProducerInfo = Struct.new(:name, :version, keyword_init: true)
    Consistency = Struct.new(:level, :metadata, keyword_init: true)
    IntegrityInfo = Struct.new(:algorithm, :checksums, keyword_init: true)
    ResourceChunk = Struct.new(:sequence, :path, :record_count, :uncompressed_bytes, :sha256, keyword_init: true)
    Resource = Struct.new(:name, :schema, :identity, :record_count, :chunks, :descriptor, keyword_init: true)
    AssetSummary = Struct.new(:count, :total_bytes, :index, keyword_init: true)
    InspectionResult = Struct.new(:valid, :pasp_version, :package_id, :export_id, :scope, :producer, :consistency, :resources, :assets, :relationships, :integrity, keyword_init: true)
    Manifest = Struct.new(:raw) do
      def [](key) = raw[key.to_s] || raw[key.to_sym]
    end
  end
end
