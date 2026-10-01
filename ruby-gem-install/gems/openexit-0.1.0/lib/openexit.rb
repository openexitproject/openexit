require "pathname"
require_relative "openexit/version"
require_relative "openexit/constants"
require_relative "openexit/errors"
require_relative "openexit/models"
require_relative "openexit/paths"
require_relative "openexit/manifest"
require_relative "openexit/validation"
require_relative "openexit/integrity"
require_relative "openexit/bundle"

module OpenExit
  class << self
    def parse_manifest(source) = Manifest.parse(source)
    def validate_manifest(manifest) = Validation.validate_manifest(manifest)
    def inspect_bundle(path) = BundleOps.inspect_bundle(path, false)
    def verify_bundle(path) = BundleOps.inspect_bundle(path, true)
    def load_schema(name) = Validation.load_schema(name)
  end
end
