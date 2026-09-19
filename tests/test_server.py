import json

from omnifocus_mcp.bridge import OmniFocusClient, load_omnijs, wrap_jxa
from omnifocus_mcp.errors import OmniFocusError
from omnifocus_mcp.server import (
    add_task,
    complete_items,
    mcp,
    omnifocus_status,
    query_tasks,
    remove_items,
    set_client,
)
import pytest


class FakeRunner:
    def __init__(self, data=None, raw=None, error=None):
        self.calls = []
        self.data = data if data is not None else {"hello": "world"}
        self.raw = raw
        self.error = error

    def evaluate(self, source: str, timeout: float) -> str:
        self.calls.append(source)
        if self.error:
            return json.dumps({"ok": False, "error": self.error})
        if self.raw is not None:
            return self.raw
        return json.dumps({"ok": True, "data": self.data})


@pytest.fixture(autouse=True)
def restore_client():
    set_client(None)
    yield
    set_client(None)


def test_load_omnijs_contains_dispatcher():
    source = load_omnijs()
    assert "function dispatch(p)" in source
    assert "var payload = PAYLOAD;" in source
    assert "query_tasks" in source
    assert "dump_database" not in source


def test_wrap_jxa_quotes_source():
    wrapped = wrap_jxa("return 1;")
    assert "evaluateJavascript" in wrapped
    assert "OF_NOT_RUNNING" in wrapped


def test_client_injects_payload():
    runner = FakeRunner(data={"totalCount": 3})
    client = OmniFocusClient(runner=runner, timeout=5)
    result = client.call("count_tasks", source="inbox")
    assert result == {"totalCount": 3}
    assert "count_tasks" in runner.calls[0]
    assert "inbox" in runner.calls[0]


def test_client_raises_structured_error():
    runner = FakeRunner(error={"code": "OF_NOT_RUNNING", "message": "closed"})
    client = OmniFocusClient(runner=runner, timeout=5)
    with pytest.raises(OmniFocusError) as exc:
        client.call("status")
    assert exc.value.code == "OF_NOT_RUNNING"


def test_status_tool_uses_client():
    set_client(OmniFocusClient(runner=FakeRunner(data={"running": True, "counts": {"inbox": 2}}), timeout=5))
    result = omnifocus_status()
    assert result["ok"] is True
    assert result["data"]["counts"]["inbox"] == 2


def test_query_tasks_rejects_bad_date():
    result = query_tasks(due_before="next friday")
    assert result["ok"] is False
    assert result["error"]["code"] == "OF_VALIDATION"


def test_add_task_rejects_empty_date():
    result = add_task(name="Test", due_date=" ")
    assert result["ok"] is False
    assert result["error"]["code"] == "OF_VALIDATION"


def test_complete_items_limit():
    result = complete_items(ids=[str(i) for i in range(101)])
    assert result["ok"] is False
    assert "100" in result["error"]["message"]


def test_remove_items_requires_confirm_token():
    runner = FakeRunner(data={"preview": [{"id": "t1", "type": "task", "name": "Demo", "descendantTaskCount": 0}]})
    set_client(OmniFocusClient(runner=runner, timeout=5))
    preview = remove_items(ids=["t1"])
    assert preview["ok"] is True
    token = preview["data"]["confirmToken"]
    assert token
    runner.data = {"removed": [{"id": "t1"}], "count": 1}
    executed = remove_items(confirm_token=token)
    assert executed["ok"] is True
    assert executed["data"]["count"] == 1


def test_server_registers_expected_surface():
    tools = {tool.name for tool in mcp._tool_manager.list_tools()}
    expected = {
        "omnifocus_status",
        "query_tasks",
        "count_tasks",
        "query_projects",
        "query_folders",
        "query_tags",
        "query_perspectives",
        "read_attachment",
        "add_task",
        "add_project",
        "add_items",
        "create_project_from_outline",
        "edit_item",
        "complete_items",
        "move_items",
        "remove_items",
        "duplicate_items",
        "set_repetition",
        "manage_folder",
        "manage_tag",
        "manage_perspective",
        "manage_notifications",
        "append_note",
        "mark_reviewed",
        "omnifocus_session",
    }
    assert expected <= tools
    assert "dump_database" not in tools
    prompts = {prompt.name for prompt in mcp._prompt_manager.list_prompts()}
    assert {
        "daily_planning",
        "weekly_review",
        "inbox_processing",
        "project_planning",
        "project_shaping",
        "evening_shutdown",
    } <= prompts
