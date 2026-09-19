"""Structured OmniFocus errors with stable codes for model recovery."""

from __future__ import annotations

from typing import Any


class OmniFocusError(Exception):
    """Raised when an OmniFocus operation cannot be completed."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"ok": False, "error": {"code": self.code, "message": self.message}}
        if self.details:
            payload["error"]["details"] = self.details
        return payload

    def __str__(self) -> str:
        extra = f" details={self.details}" if self.details else ""
        return f"{self.code}: {self.message}{extra}"


def from_bridge_error(payload: dict[str, Any]) -> OmniFocusError:
    error = payload.get("error") or {}
    return OmniFocusError(
        str(error.get("code") or "OF_SCRIPT_ERROR"),
        str(error.get("message") or "OmniFocus script failed"),
        details=error.get("details") if isinstance(error.get("details"), dict) else {},
    )
