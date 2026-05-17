#!/usr/bin/env python3
"""check_audit_write — PreToolUse hook protecting the audit log path.

NO direct JS equivalent. Designed for the framework's audit story: the audit
log is append-only and may only be written by the post_tool_use audit_write
hook itself (which uses O_APPEND). Any agent-driven Write or Edit that
targets the AUDIT_LOG path is treated as audit tampering and blocked.

exit(2) hard-blocks the Write/Edit. exit(0) allows it.

Stdlib only. AUDIT_LOG environment variable mirrors the JS hooks.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

AUDIT_LOG = Path(
    os.environ.get("AUDIT_LOG") or "{path/to/your/audit-log.jsonl}"
)


def main() -> None:
    try:
        raw = sys.stdin.read()
    except OSError:
        sys.exit(2)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        # Unparseable input is treated as a block. We cannot verify the
        # target if we cannot parse the payload, and the audit log is the
        # one file we never want corrupted by a fall-through.
        print(
            "Audit-write guard blocked: unparseable hook payload.",
            file=sys.stderr,
        )
        sys.exit(2)

    if not isinstance(payload, dict):
        print(
            "Audit-write guard blocked: non-object hook payload.",
            file=sys.stderr,
        )
        sys.exit(2)

    tool = payload.get("tool_name")
    tool_input = payload.get("tool_input") or {}

    # Scope: only Write/Edit can mutate the audit log. Everything else
    # passes through untouched.
    if tool not in ("Write", "Edit"):
        sys.exit(0)

    file_path = tool_input.get("file_path")
    if not isinstance(file_path, str):
        sys.exit(0)

    # Full-path equality, normalized on both sides. Without normalization,
    # a payload sending ".//audit-log.jsonl" would bypass the equality check.
    target = os.path.normpath(file_path)
    protected = os.path.normpath(str(AUDIT_LOG))

    if target == protected:
        print(
            f"Audit log {AUDIT_LOG} is append-only. "
            "Tool calls cannot Write or Edit it directly; "
            "audit entries are written by the post_tool_use/audit_write hook.",
            file=sys.stderr,
        )
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        # Fail-closed default. Uncaught error → block, never silent allow.
        sys.exit(2)
