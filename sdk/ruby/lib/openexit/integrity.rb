require "digest"
module OpenExit
  module Integrity
    module_function
    def hash_file(path)
      digest = Digest::SHA256.new
      bytes = 0
      File.open(path, "rb") { |io| while (chunk = io.read(1024 * 1024)); digest.update(chunk); bytes += chunk.bytesize; end }
      [digest.hexdigest, bytes]
    rescue SystemCallError => e
      raise PaspError.new("PASP_MALFORMED_PACKAGE", "cannot read file: #{path}", context: e)
    end
    def verify_file(path, expected, expected_bytes = nil)
      actual, bytes = hash_file(path)
      raise PaspError.new("PASP_CHECKSUM_MISMATCH", "checksum mismatch: #{path}") unless actual == expected
      raise PaspError.new("PASP_CHECKSUM_MISMATCH", "byte length mismatch: #{path}") if expected_bytes && bytes != expected_bytes
      true
    end
  end
end
