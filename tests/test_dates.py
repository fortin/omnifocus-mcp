from omnifocus_mcp.dates import validate_date
from omnifocus_mcp.errors import OmniFocusError
import pytest


def test_date_only_accepted():
    assert validate_date("2026-08-14", "dueDate") == "2026-08-14"


def test_local_datetime_accepted():
    assert validate_date("2026-08-14T09:30", "dueDate") == "2026-08-14T09:30"
    assert validate_date("2026-08-14T09:30:05", "dueDate") == "2026-08-14T09:30:05"


def test_offset_datetime_accepted():
    assert validate_date("2026-08-14T09:30:00-06:00", "dueDate") == "2026-08-14T09:30:00-06:00"
    assert validate_date("2026-08-14T15:00:00Z", "dueDate") == "2026-08-14T15:00:00Z"


def test_empty_rejected():
    with pytest.raises(OmniFocusError) as exc:
        validate_date("  ", "dueDate")
    assert exc.value.code == "OF_VALIDATION"


def test_garbage_rejected():
    with pytest.raises(OmniFocusError) as exc:
        validate_date("tomorrow", "dueDate")
    assert exc.value.code == "OF_VALIDATION"
    assert exc.value.details["field"] == "dueDate"


def test_none_passthrough():
    assert validate_date(None, "dueDate") is None
