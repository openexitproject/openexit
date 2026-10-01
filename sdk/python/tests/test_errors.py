from openexit import OpenExitError, PaspError


def test_error_code_and_base_class():
    error = PaspError("PASP_INVALID_RECORD", "bad row", context={"line": 4})
    assert isinstance(error, OpenExitError)
    assert error.code == "PASP_INVALID_RECORD"
    assert error.context == {"line": 4}
