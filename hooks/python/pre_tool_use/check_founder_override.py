#!/usr/bin/env python3
# raw Claude Code payload — no enriched context fields
# Utility module — replicates check-founder-override.js (module.exports).
# NOT a standalone hook gate. Import is_override_active() from other hooks.

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

MARKER_PATH = (
    Path(__file__).parent.parent.parent / ".claude" / ".founder-override-active"
)
TTL_SECONDS = 10 * 60

AUDIT_LOG = Path("docs/audit/founder-overrides.log")


def read_marker() -> dict | None:
    try:
        raw = MARKER_PATH.read_text(encoding="utf-8")
    except OSError:
        return None

    if raw.startswith("﻿"):
        raw = raw[1:]

    try:
        parsed = json.loads(raw)
    except (ValueError, json.JSONDecodeError):
        return None

    if not isinstance(parsed, dict):
        return None

    created_at = parsed.get("createdAt")
    if not isinstance(created_at, str):
        return None

    cleaned = created_at.replace("Z", "+00:00") if created_at.endswith("Z") else created_at
    try:
        dt = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    age = (datetime.now(timezone.utc) - dt).total_seconds()
    if age > TTL_SECONDS:
        return None

    return parsed


def is_override_active(_input=None) -> bool:
    return read_marker() is not None


def get_override_reason() -> str:
    marker = read_marker()
    if marker and isinstance(marker.get("reason"), str):
        return marker["reason"]
    return "unknown"


def log_override(hook_name: str, file_path: str, reason: str) -> None:
    try:
        AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).isoformat()
        line = f"[{ts}] [{hook_name}] OVERRIDE: {file_path} | reason: {reason}\n"
        with AUDIT_LOG.open("a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass


if __name__ == "__main__":
    try:
        sys.stdin.read()
    except OSError:
        pass
    active = is_override_active()
    reason = get_override_reason() if active else "n/a"
    print(f"override_active={active} reason={reason}")
    sys.exit(0)
