#!/usr/bin/env python3
"""check_bulletin_order — PreToolUse hook enforcing WORKING-before-DONE.

Python port of hooks/pre-tool-use/check-bulletin-order.example.js. A [DONE]
entry on the shared bulletin is allowed only if a [WORKING] entry already
exists in the bulletin file. WORKING entries themselves are not order-gated.

exit(2) hard-blocks the Write/Edit. exit(0) allows it.

# raw Claude Code payload — no enriched context fields
Stdlib only. Session-scoped matching is not possible without enrichment, so
this hook checks the looser invariant: the bulletin must contain at least
one [WORKING] entry before any [DONE] is allowed. If the bulletin file is
unreadable we fail closed (exit 2).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

BULLETIN_PATH = Path(
    os.environ.get("BULLETIN_PATH") or "{path/to/your/bulletin.md}"
)
AUDIT_LOG = Path(
    os.environ.get("AUDIT_LOG") or "{path/to/your/audit-log.jsonl}"
)


def _audit(decision: str, reason: str, payload: dict | None, extra: dict | None = None) -> None:
    try:
        ctx = (payload or {}).get("context") or {}
        record = {
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "hook": "check_bulletin_order",
            "decision": decision,
            "reason": reason,
            "tool_name": (payload or {}).get("tool_name"),
            "session_id": ctx.get("session_id"),
            "agent_id": ctx.get("agent_id"),
            "correlation_id": ctx.get("correlation_id"),
        }
        if extra:
            record.update(extra)
        with AUDIT_LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
    except OSError:
        # Audit failure must not flip the decision.
        pass


def _classify(content: str) -> str:
    if "[DONE]" in content:
        return "DONE"
    if "[WORKING]" in content:
        return "WORKING"
    return "OTHER"


def _bulletin_has_working_entry() -> tuple[bool, str]:
    """Return (has_entry, status). status is 'unreadable' if I/O failed."""
    try:
        raw = BULLETIN_PATH.read_text(encoding="utf-8")
    except OSError:
        return False, "unreadable"
    return ("[WORKING]" in raw), "ok"


def main() -> None:
    try:
        raw = sys.stdin.read()
    except OSError:
        sys.exit(2)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        _audit("block", "invalid_json_input", None)
        sys.exit(2)

    if not isinstance(payload, dict):
        _audit("block", "non_object_payload", None)
        sys.exit(2)

    tool = payload.get("tool_name")
    tool_input = payload.get("tool_input") or {}

    is_write = tool in ("Write", "Edit")
    file_path = tool_input.get("file_path")
    targets_bulletin = (
        isinstance(file_path, str)
        and os.path.normpath(file_path) == os.path.normpath(str(BULLETIN_PATH))
    )

    if not is_write or not targets_bulletin:
        _audit("allow", "not_in_scope", payload)
        sys.exit(0)

    content = tool_input.get("content") if isinstance(tool_input.get("content"), str) else ""
    kind = _classify(content)

    if kind != "DONE":
        _audit("allow", "not_a_done_entry", payload, {"kind": kind})
        sys.exit(0)

    has_working, status = _bulletin_has_working_entry()
    if status == "unreadable":
        _audit("block", "bulletin_unreadable", payload)
        print(
            "Bulletin unreadable. Refusing [DONE] write until file can be verified.",
            file=sys.stderr,
        )
        sys.exit(2)

    if not has_working:
        _audit("block", "done_without_prior_working", payload)
        print(
            "Bulletin order violation: a [WORKING] entry must exist in the "
            "bulletin before any [DONE] entry is written.",
            file=sys.stderr,
        )
        sys.exit(2)

    _audit("allow", "done_after_working", payload)
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        # Fail-closed default — uncaught errors must result in a block.
        sys.exit(2)
