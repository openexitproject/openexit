require_relative "test_helper"
require "json"
class ConformanceTest < Minitest::Test
  ROOT = File.expand_path("../../../", __dir__)
  def test_shared_suite
    suite = JSON.parse(File.read(File.join(ROOT, "protocol/pasp/v1/conformance/suite.json")))
    assert_equal 27, suite.fetch("cases").length
    suite.fetch("cases").each do |test_case|
      path = File.join(ROOT, "protocol/pasp/v1/conformance", test_case.fetch("path"))
      if test_case.dig("expected", "valid")
        assert OpenExit.verify_bundle(path), test_case.fetch("id")
      else
        error = assert_raises(OpenExit::PaspError, test_case.fetch("id")) { OpenExit.verify_bundle(path) }
        assert_equal test_case.dig("expected", "errorCode"), error.code, test_case.fetch("id")
      end
    end
  end
end