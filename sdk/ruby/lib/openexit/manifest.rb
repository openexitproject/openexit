require "json"
module OpenExit
  module Manifest
    module_function
    def parse(source)
      value = if source.is_a?(Hash) then source.dup
      elsif source.respond_to?(:to_path) then JSON.parse(File.read(source.to_path, encoding: "UTF-8"))
      elsif source.respond_to?(:read) then JSON.parse(source.read)
      elsif source.is_a?(String) then JSON.parse(source)
      else raise TypeError, "manifest source must be a Hash, path, IO, or JSON string" end
      raise PaspError.new("PASP_INVALID_MANIFEST", "manifest must be a JSON object") unless value.is_a?(Hash)
      Models::Manifest.new(value)
    rescue JSON::ParserError, ArgumentError, EncodingError, Errno::ENOENT, IOError => e
      raise PaspError.new("PASP_INVALID_MANIFEST", "cannot parse manifest JSON", context: e)
    end
  end
end
