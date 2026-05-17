#!/usr/bin/env python3
# raw Claude Code payload — no enriched context fields
# Replicates check-locked-states.js exactly: reads LOCKED-STATES.md as
# plain text, regex token extraction, basename matching, section surfacing.

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_founder_override import (
    get_override_reason,
    is_override_active,
    log_override,
)

TOKEN_RE = re.compile(r'[A-Za-z0-9_.\-/]+\.(?:js|jsx|ts|tsx|css|scss|json|md|html)')
SECTION_RE = re.compile(r'^---$', re.MULTILINE)


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read())
    except (OSError, ValueError):
        sys.exit(0)

    if not isinstance(payload, dict):
        sys.exit(0)

    if payload.get("tool_name") not in ("Edit", "Write"):
        sys.exit(0)

    tool_input = payload.get("tool_input") or {}
    file_path = tool_input.get("file_path")
    if not isinstance(file_path, str):
        sys.exit(0)
    file_path = file_path.replace("\\", "/")

    if "/docs/" in file_path or ".claude/" in file_path:
        sys.exit(0)

    locked_path = Path(
        os.environ.get("LOCKED_STATES_MD")
        or (Path(__file__).resolve().parent.parent.parent / "docs" / "LOCKED-STATES.md")
    )
    try:
        text = locked_path.read_text(encoding="utf-8")
    except OSError:
        sys.exit(0)

    tokens = TOKEN_RE.findall(text)
    basename = file_path.rsplit("/", 1)[-1]
    matched = None
    for token in tokens:
        if "/" in token:
            if file_path == token or file_path.endswith("/" + token):
                matched = token
                break
        else:
            if basename == token:
                matched = token
                break

    if matched is None:
        sys.exit(0)

    if is_override_active(payload):
        reason = get_override_reason()
        log_override("check-locked-states", file_path, reason)
        print("Override active — check-locked-states bypassed", file=sys.stderr)
        sys.exit(0)

    matching_section = None
    for section in SECTION_RE.split(text):
        if matched in section:
            matching_section = section.strip()
            break

    print(
        f"BLOCKED (exit 2): {matched} contains locked states per LOCKED-STATES.md.\n\n"
        f"Locked decision found:\n{matching_section or 'See LOCKED-STATES.md'}\n\n"
        "This file cannot be edited without explicit founder override.",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
