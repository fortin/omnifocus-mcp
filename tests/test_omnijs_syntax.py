"""Check the bundled OmniJS parses as JavaScript."""

from __future__ import annotations

import shutil
import subprocess

from omnifocus_mcp.bridge import load_omnijs


def test_omnijs_is_parseable():
    source = load_omnijs().replace("var payload = PAYLOAD;", "var payload = {};", 1)
    node = shutil.which("node")
    if not node:
        assert "function dispatch(p)" in source
        assert "evaluateJavascript" not in source
        return
    completed = subprocess.run(
        [node, "--check"],
        input=source,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
