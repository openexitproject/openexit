module OpenExit
  module Paths
    module_function
    def validate_package_path(value)
      unless value.is_a?(String) && !value.empty? && !value.include?("\0") && !value.include?("\\") && !value.start_with?("/", "~") && value !~ /\A[A-Za-z]:/ && value.split("/").none? { |p| p.empty? || p == "." || p == ".." }
        raise PaspError.new("PASP_PATH_TRAVERSAL", "unsafe package path: #{value}")
      end
      nil
    end
    def safe_path(root, value)
      validate_package_path(value)
      base = File.realpath(root)
      candidate = File.expand_path(value.tr("/", File::SEPARATOR), base)
      real = File.exist?(candidate) ? File.realpath(candidate) : candidate
      unless real == base || real.start_with?(base + File::SEPARATOR)
        raise PaspError.new("PASP_PATH_TRAVERSAL", "path escapes package: #{value}")
      end
      candidate
    rescue Errno::ENOENT
      candidate
    end
  end
end
