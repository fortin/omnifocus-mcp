from omnifocus_mcp.errors import OmniFocusError, from_bridge_error


def test_to_dict_includes_details():
    err = OmniFocusError("OF_NOT_FOUND", "missing", details={"id": "abc"})
    payload = err.to_dict()
    assert payload["ok"] is False
    assert payload["error"]["code"] == "OF_NOT_FOUND"
    assert payload["error"]["details"]["id"] == "abc"


def test_from_bridge_error():
    err = from_bridge_error({"ok": False, "error": {"code": "OF_TIMEOUT", "message": "slow"}})
    assert err.code == "OF_TIMEOUT"
    assert "slow" in err.message
