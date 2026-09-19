"""Run OmniJS inside OmniFocus via JXA ``evaluateJavascript``."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from importlib.resources import files
from pathlib import Path
from typing import Any, Protocol

from omnifocus_mcp.errors import OmniFocusError, from_bridge_error

_OMNIJS_FILES = ("helpers.js", "query.js", "mutate.js", "main.js")


class ScriptRunner(Protocol):
    def evaluate(self, source: str, timeout: float) -> str: ...


class OsascriptRunner:
    def evaluate(self, source: str, timeout: float) -> str:
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as handle:
            handle.write(source)
            path = handle.name
        try:
            completed = subprocess.run(
                ["osascript", "-l", "JavaScript", path],
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise OmniFocusError(
                "OF_TIMEOUT",
                f"OmniFocus script timed out after {timeout:.0f}s. "
                "Increase OMNIFOCUS_TIMEOUT_SECONDS if the database is large.",
            ) from exc
        except FileNotFoundError as exc:
            raise OmniFocusError("OF_TRANSPORT_UNAVAILABLE", "osascript is not available") from exc
        finally:
            Path(path).unlink(missing_ok=True)

        if completed.returncode != 0:
            err = (completed.stderr or completed.stdout or "").strip()
            code = "OF_SCRIPT_ERROR"
            lower = err.lower()
            if "not authorized" in lower or "(-1743)" in err or "1002" in err:
                code = "OF_PERMISSION_DENIED"
                err = (
                    "Automation permission denied. In System Settings → Privacy & Security → "
                    "Automation, allow this app to control OmniFocus."
                )
            elif "(-2700)" in err or "application isn't running" in lower:
                code = "OF_NOT_RUNNING"
            raise OmniFocusError(code, err or "osascript failed")
        return completed.stdout


def load_omnijs() -> str:
    root = files("omnifocus_mcp") / "omnijs"
    parts = [(root / name).read_text(encoding="utf-8") for name in _OMNIJS_FILES]
    return "\n".join(parts)


def wrap_jxa(omnijs: str) -> str:
    encoded = json.dumps(omnijs)
    return f"""
function run() {{
  const of = Application("OmniFocus");
  if (!of.running()) {{
    return JSON.stringify({{
      ok: false,
      error: {{
        code: "OF_NOT_RUNNING",
        message: "OmniFocus is not running. Open OmniFocus and retry."
      }}
    }});
  }}
  const source = {encoded};
  try {{
    const result = of.evaluateJavascript(source);
    return (typeof result === "string") ? result : JSON.stringify(result);
  }} catch (e) {{
    const msg = String(e);
    let code = "OF_SCRIPT_ERROR";
    if (msg.toLowerCase().indexOf("not authorized") >= 0 || msg.indexOf("-1743") >= 0) {{
      code = "OF_PERMISSION_DENIED";
    }}
    return JSON.stringify({{ok: false, error: {{code: code, message: msg}}}});
  }}
}}
"""


class OmniFocusClient:
    def __init__(self, runner: ScriptRunner | None = None, timeout: float | None = None) -> None:
        self.runner = runner or OsascriptRunner()
        self.timeout = timeout or float(os.environ.get("OMNIFOCUS_TIMEOUT_SECONDS", "60"))
        self._template = load_omnijs()

    def call(self, op: str, **payload: Any) -> Any:
        body = dict(payload)
        body["op"] = op
        source = self._template.replace("var payload = PAYLOAD;", "var payload = " + json.dumps(body) + ";", 1)
        raw = self.runner.evaluate(wrap_jxa(source), self.timeout)
        text = raw.strip()
        if text.startswith("'") and text.endswith("'"):
            text = text[1:-1]
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError as exc:
            raise OmniFocusError("OF_SCRIPT_ERROR", "OmniFocus returned non-JSON output", details={"raw": text[:500]}) from exc
        if not parsed.get("ok"):
            raise from_bridge_error(parsed)
        return parsed.get("data")
