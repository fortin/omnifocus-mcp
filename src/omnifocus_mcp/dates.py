"""Validate date inputs before they reach OmniJS.

OmniFocus stores due/defer/planned dates as floating wall-clock values.
This module only checks the wire format; conversion happens inside OmniJS:

- ``YYYY-MM-DD`` → local midnight, floating
- ``YYYY-MM-DDTHH:MM[:SS]`` without a zone → local wall-clock, floating
- ISO-8601 with ``Z`` or an offset → converted to local wall-clock so the
  calendar day and time the user meant are preserved
"""

from __future__ import annotations

import re

from omnifocus_mcp.errors import OmniFocusError

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_DATETIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?$"
)


def validate_date(value: str | None, field: str) -> str | None:
    """Return ``value`` unchanged if it is a supported date string."""
    if value is None:
        return None
    text = value.strip()
    if not text:
        raise OmniFocusError("OF_VALIDATION", f"{field} must not be empty")
    if _DATE.fullmatch(text) or _DATETIME.fullmatch(text):
        return text
    raise OmniFocusError(
        "OF_VALIDATION",
        f"{field} must be YYYY-MM-DD or an ISO-8601 datetime "
        "(optionally with Z or ±HH:MM offset)",
        details={"field": field, "value": text},
    )


def validate_optional_dates(values: dict[str, str | None]) -> dict[str, str | None]:
    """Validate a mapping of field name → date string."""
    return {name: validate_date(value, name) for name, value in values.items()}
