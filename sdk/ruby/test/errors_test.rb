require_relative "test_helper"
class ErrorsTest < Minitest::Test
  def test_codes_are_exposed
    error = OpenExit::PaspError.new("PASP_INVALID_MANIFEST", "bad")
    assert_equal "PASP_INVALID_MANIFEST", error.code
  end
end
