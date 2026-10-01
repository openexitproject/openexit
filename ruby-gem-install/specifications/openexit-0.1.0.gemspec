# -*- encoding: utf-8 -*-
# stub: openexit 0.1.0 ruby lib

Gem::Specification.new do |s|
  s.name = "openexit".freeze
  s.version = "0.1.0".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["OpenExit contributors".freeze]
  s.date = "1980-01-02"
  s.description = "Ruby SDK for reading and verifying Portable Application State Protocol directory bundles.".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 3.1".freeze)
  s.rubygems_version = "4.0.20".freeze
  s.summary = "PASP 1.0 reader and verifier for Ruby".freeze

  s.installed_by_version = "4.0.20".freeze

  s.specification_version = 4

  s.add_runtime_dependency(%q<json_schemer>.freeze, ["~> 2.4".freeze])
end
