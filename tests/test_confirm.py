from omnifocus_mcp.confirm import ConfirmStore
import pytest


def test_issue_and_consume():
    store = ConfirmStore(ttl_seconds=60)
    token = store.issue("remove_items", {"ids": ["a", "b"]})
    payload = store.consume(token, "remove_items")
    assert payload == {"ids": ["a", "b"]}
    with pytest.raises(KeyError):
        store.consume(token, "remove_items")


def test_wrong_operation_rejected():
    store = ConfirmStore()
    token = store.issue("remove_items", {"ids": ["a"]})
    with pytest.raises(KeyError):
        store.consume(token, "remove_folder")


def test_expired_token(monkeypatch):
    store = ConfirmStore(ttl_seconds=1)
    token = store.issue("remove_items", {"ids": ["a"]})
    store._pending[token].expires_at = 0
    with pytest.raises(KeyError):
        store.consume(token, "remove_items")
