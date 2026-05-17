#!/usr/bin/env python3
"""audit_write — PostToolUse hook writing one append-only JSONL entry per call.

Python port of hooks/post-tool-use/audit-write.example.js. Writes a tamper-
evident audit entry containing a sha256 of the canonicalized tool input
rather than the input payload itself.

Exit-code contract divergence from the JS reference:
  The JS hook exits 1 on audit-write failures (observability signal). This
  Python port adheres to the framework-wide rule that hooks must use only
  exit(0) for allow and exit(2) for hard block. PostToolUse cannot block
  (the call already ran), so this hook always exits 0 and surfaces failures
  via stderr — the operator still sees the audit-gap notice on the next
  review of hook output.

Stdlib only. AUDIT_LOG environment variable mirrors the JS hook.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

AUDIT_LOG = Path(
    os.environ.get("AUDIT_LOG") or "{path/to/your/audit-log.jsonl}"
)


def _hash_input(tool_input: object) -> str | None:
    try:
        # Canonicalize key order before hashing. Two semantically identical
        # input objects with different key orderings would otherwise produce
        # different sha256 digests, destroying the hash's value as a
        # tamper-evident reference. sort_keys gives us that canonical form.
        canonical = json.dumps(tool_input, sort_keys=True)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    except (TypeError, ValueError):
        # Non-serializable inputs → null hash. We still want to log the
        # entry; the missing hash is itself useful evidence that something
        # unusual was passed to the tool.
        return None


def _status_of(result: object) -> str:
    if not isinstance(result, dict):
        return "unknown"
    if result.get("status"):
        return str(result["status"])
    if result.get("error"):
        return "error"
    return "success"


def main() -> None:
    raw = sys.stdin.read()
    payload = json.loads(raw)

    ctx = payload.get("context") or {}
    agent_depth = ctx.get("agent_depth")
    # isinstance check (not truthiness) because depth 0 is the orchestrator
    # and is a valid value — `or None` would replace 0 with None and erase
    # the orchestrator's depth from every audit entry.
    entry = {
        "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "agent_id": ctx.get("agent_id"),
        "agent_depth": agent_depth if isinstance(agent_depth, int) else None,
        "session_id": ctx.get("session_id"),
        "correlation_id": ctx.get("correlation_id"),
        "tool_name": payload.get("tool_name"),
        # Hash, not raw input. Raw inputs can be arbitrarily large (full
        # file contents on a Write call), and storing them duplicates data
        # already present in the workspace. The hash gives us a tamper-
        # evident reference instead.
        "tool_input_hash": _hash_input(payload.get("tool_input")),
        "tool_result_status": _status_of(payload.get("tool_result")),
    }

    # Atomic-ish append. POSIX guarantees that O_APPEND writes up to
    # PIPE_BUF (4 KB on Linux, commonly the same in practice on macOS) are
    # atomic with respect to other O_APPEND writers. Our JSONL line is well
    # under that, so concurrent hook processes will not produce torn writes.
    line = json.dumps(entry) + "\n"
    with AUDIT_LOG.open("a", encoding="utf-8") as fh:
        fh.write(line)

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        # PostToolUse hooks must NOT fail silently — that defeats the point.
        # Surface to stderr so the operator notices the audit gap on their
        # next review of hook output. We exit 0 (per the framework-wide
        # 0-or-2 contract) — the call already executed and we cannot
        # retroactively block it.
        sys.stderr.write(f"audit_write hook failed: {exc}\n")
        sys.exit(0)
