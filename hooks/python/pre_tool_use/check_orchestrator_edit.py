#!/usr/bin/env python3
# raw Claude Code payload — no enriched context fields
# Replicates check-orchestrator-edit.js exactly: bulletin-aware
# orchestrator detection via last-30-lines scan.

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ALLOWED_EXACT = (
    "docs/agent-bulletin.md",
    "docs/agent-locks.md",
)

ALLOWED_PREFIXES = (
    "docs/manifests/",
)

ORCHESTRATOR_MARKERS = (
    "[ORCHESTRATOR] ACTIVATED",
    "[ORCHESTRATOR] ROUTING",
    "[ORCHESTRATOR] SPAWNING",
)

AGENT_STARTED_RE = re.compile(
    r"\[(AGENT-|FIX-AGENT|BUILDER|QA-AGENT).*\] (STARTED|WORKING)",
    re.IGNORECASE,
)


def main() -> None:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
    except Exception:
        sys.exit(0)

    if not isinstance(payload, dict):
        sys.exit(0)

    tool = payload.get("tool_name")
    if tool not in ("Edit", "Write"):
        sys.exit(0)

    tool_input = payload.get("tool_input") or {}
    if not isinstance(tool_input, dict):
        sys.exit(0)

    file_path = tool_input.get("path")
    if not isinstance(file_path, str) or not file_path:
        file_path = tool_input.get("file_path")
    if not isinstance(file_path, str) or not file_path:
        sys.exit(0)

    file_path = file_path.replace("\\", "/")

    if ".claude/" in file_path:
        print(
            "BLOCKED: .claude/ is founder-only territory. No agent may touch hooks, "
            "settings, or command files. Make this change yourself directly in the "
            "filesystem.",
            file=sys.stderr,
        )
        sys.exit(2)

    if file_path in ALLOWED_EXACT:
        sys.exit(0)

    for prefix in ALLOWED_PREFIXES:
        if file_path.startswith(prefix):
            sys.exit(0)

    try:
        bulletin = Path("docs/agent-bulletin.md").read_text()
    except Exception:
        sys.exit(0)

    lines = bulletin.split("\n")
    tail = lines[-30:]

    last_orchestrator = -1
    last_agent_started = -1

    for i, line in enumerate(tail):
        if any(marker in line for marker in ORCHESTRATOR_MARKERS):
            last_orchestrator = i
        if AGENT_STARTED_RE.search(line):
            last_agent_started = i

    if last_orchestrator > last_agent_started:
        print(
            "BLOCKED: Orchestrator cannot edit files directly. Route to the "
            "appropriate agent. Only agent-bulletin.md and agent-locks.md are "
            "writable by orchestrator.",
            file=sys.stderr,
        )
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
