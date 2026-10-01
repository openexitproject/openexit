require_relative "lib/openexit/version"
Gem::Specification.new do |spec|
  spec.name = "openexit"
  spec.version = OpenExit::VERSION
  spec.summary = "PASP 1.0 reader and verifier for Ruby"
  spec.description = "Ruby SDK for reading and verifying Portable Application State Protocol directory bundles."
  spec.authors = ["OpenExit contributors"]
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1"
  spec.files = Dir["lib/**/*.rb", "lib/**/*.json", "README.md", "LICENSE"].sort
  spec.require_paths = ["lib"]
  spec.add_runtime_dependency "json_schemer", "~> 2.4"
  spec.metadata["rubygems_mfa_required"] = "true"
end
