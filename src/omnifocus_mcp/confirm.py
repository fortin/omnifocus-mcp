"""In-process confirmation tokens for destructive OmniFocus writes."""

from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class PendingAction:
    operation: str
    payload: dict[str, Any]
    expires_at: float


class ConfirmStore:
    """Issue short-lived tokens so deletes/moves cannot skip the preview step."""

    def __init__(self, ttl_seconds: int = 300) -> None:
        self.ttl_seconds = ttl_seconds
        self._pending: dict[str, PendingAction] = {}

    def issue(self, operation: str, payload: dict[str, Any]) -> str:
        self.purge()
        token = secrets.token_urlsafe(18)
        self._pending[token] = PendingAction(
            operation=operation,
            payload=payload,
            expires_at=time.time() + self.ttl_seconds,
        )
        return token

    def consume(self, token: str, operation: str) -> dict[str, Any]:
        self.purge()
        action = self._pending.pop(token, None)
        if action is None:
            raise KeyError("Unknown or expired confirm token")
        if action.operation != operation:
            raise KeyError("Confirm token does not match this operation")
        return action.payload

    def peek(self, token: str) -> PendingAction | None:
        self.purge()
        return self._pending.get(token)

    def purge(self) -> None:
        now = time.time()
        expired = [key for key, action in self._pending.items() if action.expires_at <= now]
        for key in expired:
            del self._pending[key]
