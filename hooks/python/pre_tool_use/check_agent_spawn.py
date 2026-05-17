#!/usr/bin/env python3
"""check_agent_spawn — PreToolUse hook for the Agent tool (Claude Code native).

Python port of hooks/pre-tool-use/check-agent-spawn.example.js. Validates that
an Agent spawn carries a [MANIFEST:taskId] token whose sidecar passes every
gate: required fields, session_id, roster, mtime freshness, prompt-hash match,
HITL approval, and TTL.

exit(2) hard-blocks the spawn. exit(0) allows it.

Dependencies: stdlib only. Where the JS hook uses ajv for full JSON Schema
validation, this Python hook applies the same fallback the JS uses when ajv is
unavailable — a required-fields presence check. Authors who want full schema
enforcement can wire packages/awf-python (Pydantic) into a separate adapter;
keeping this file stdlib-only is deliberate so the hook runs under any 3.10+
interpreter without an install step.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import NoReturn

# AWF_PROJECT_ROOT: set this environment variable to your repo root if the
# hook install path does not resolve correctly via os.getcwd().
PROJECT_ROOT = Path(os.environ.get("AWF_PROJECT_ROOT") or os.getcwd())
MANIFEST_DIR = PROJECT_ROOT / os.environ.get(
    "AWF_MANIFEST_DIR", "{path/to/manifests}"
)

ALLOWED_AGENT_ROLES = {
    "[ORCHESTRATOR_AGENT]",
    "[SERVER_AGENT]",
    "[FRONTEND_AGENT]",
    "[QA_AGENT]",
    "[FIX_AGENT]",
}

HITL_REQUIRED_RISK_LEVELS = {"high", "critical"}

# Manifest TTL — reject manifests older than this. 30 minutes is the
# recommended default. Lower for higher-security environments.
MANIFEST_TTL_MS = 30 * 60 * 1000

# File mtime is filesystem evidence — harder to spoof than a JSON field.
# 60 seconds is the recommended enforce-mode ceiling.
MANIFEST_MTIME_MAX_AGE_MS = 60 * 1000

MANIFEST_TOKEN_RE = re.compile(r"\[MANIFEST:([A-Za-z0-9._-]+)\]")

# Required-fields fallback when no JSON-Schema validator is wired in. Mirrors
# packages/awf-python/src/awf/schemas/agent_spawn_sidecar.py.
REQUIRED_FIELDS = (
    "taskId",
    "session_id",
    "runtime_subagent_type",
    "agent_role",
    "riskLevel",
    "domains",
    "riskClass",
    "hitlApproved",
    "issuedAt",
    "promptHash",
)

# HOOK_MODE: shadow (default) logs and exits 0, enforce blocks with exit 2.
HOOK_MODE = (os.environ.get("HOOK_MODE") or "shadow").lower()
ENFORCE = HOOK_MODE == "enforce"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _parse_iso_ms(value: object) -> int | None:
    if not isinstance(value, str):
        return None
    cleaned = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        dt = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _deny(reason: str) -> NoReturn:
    if ENFORCE:
        print(f"[check_agent_spawn] BLOCKED: {reason}", file=sys.stderr)
        sys.exit(2)
    print(f"[check_agent_spawn] SHADOW VIOLATION: {reason}", file=sys.stderr)
    sys.exit(0)


def main() -> None:
    try:
        raw = sys.stdin.read()
    except OSError:
        if ENFORCE:
            print(
                "[check_agent_spawn] BLOCKED: stdin unreadable in enforce mode.",
                file=sys.stderr,
            )
            sys.exit(2)
        sys.exit(0)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        if ENFORCE:
            print(
                "[check_agent_spawn] BLOCKED: stdin not valid JSON in enforce mode.",
                file=sys.stderr,
            )
            sys.exit(2)
        sys.exit(0)

    if not isinstance(payload, dict) or payload.get("tool_name") != "Agent":
        sys.exit(0)

    tool_input = payload.get("tool_input") or {}
    description = tool_input.get("description")
    if not isinstance(description, str):
        description = ""

    match = MANIFEST_TOKEN_RE.search(description)
    if not match:
        _deny("Agent spawn missing [MANIFEST:taskId] token in description.")
    task_id = match.group(1)

    manifest_path = MANIFEST_DIR / f"{task_id}.json"
    try:
        manifest_raw = manifest_path.read_text(encoding="utf-8")
    except OSError:
        _deny(f"Manifest file not found: {manifest_path}")

    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError:
        _deny(f"Manifest file is not valid JSON: {manifest_path}")

    if not isinstance(manifest, dict):
        _deny(f"Manifest must be a JSON object: {manifest_path}")

    missing = [f for f in REQUIRED_FIELDS if f not in manifest]
    if missing:
        _deny(f"Manifest missing required fields: {', '.join(missing)}")

    runtime_session_id = payload.get("session_id")
    manifest_session_id = manifest.get("session_id")
    if (
        manifest_session_id != "session-id-unavailable"
        and manifest_session_id != runtime_session_id
    ):
        _deny(
            "Manifest session_id does not match runtime session_id. "
            "Possible replay or stale manifest."
        )

    if manifest.get("agent_role") not in ALLOWED_AGENT_ROLES:
        _deny(
            f"agent_role {manifest.get('agent_role')!r} is not in the approved roster: "
            f"[{', '.join(sorted(ALLOWED_AGENT_ROLES))}]"
        )

    if (
        manifest.get("riskLevel") in HITL_REQUIRED_RISK_LEVELS
        and manifest.get("hitlApproved") is not True
    ):
        _deny(
            f"riskLevel {manifest.get('riskLevel')!r} requires hitlApproved=true; "
            f"manifest has hitlApproved={manifest.get('hitlApproved')!r}."
        )

    try:
        mtime_ms = int(manifest_path.stat().st_mtime * 1000)
    except OSError:
        _deny(f"Cannot stat manifest file for mtime check: {manifest_path}")
    mtime_age_ms = _now_ms() - mtime_ms
    if mtime_age_ms > MANIFEST_MTIME_MAX_AGE_MS:
        _deny(
            f"Manifest file mtime is {mtime_age_ms // 1000}s old. "
            f"Maximum allowed: {MANIFEST_MTIME_MAX_AGE_MS // 1000}s. "
            "Re-issue the manifest sidecar before spawning."
        )

    prompt_text = tool_input.get("prompt", "")
    if not isinstance(prompt_text, str):
        prompt_text = ""
    actual_hash = hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()
    sidecar_hash = manifest.get("promptHash") or ""
    if sidecar_hash != actual_hash:
        _deny(
            "Prompt hash mismatch. "
            f"Sidecar: {sidecar_hash[:16]}... Actual: {actual_hash[:16]}... "
            "The spawn prompt may have been modified after the sidecar was issued."
        )

    issued_at_ms = _parse_iso_ms(manifest.get("issuedAt"))
    if issued_at_ms is None:
        _deny(
            f"Manifest issuedAt {manifest.get('issuedAt')!r} is not a parseable date."
        )
    age_ms = _now_ms() - issued_at_ms
    if age_ms > MANIFEST_TTL_MS or age_ms < 0:
        _deny(
            f"Manifest age {age_ms}ms exceeds MANIFEST_TTL_MS {MANIFEST_TTL_MS}ms."
        )

    # Strip the [MANIFEST:taskId] token from description before forwarding to
    # the spawned agent. The agent never sees the token — it is a hook contract.
    stripped = MANIFEST_TOKEN_RE.sub("", description)
    stripped = re.sub(r"\s{2,}", " ", stripped).strip()
    if stripped != description:
        new_input = dict(tool_input)
        new_input["description"] = stripped
        sys.stdout.write(json.dumps({"updatedInput": new_input}))

    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        if ENFORCE:
            print(f"[check_agent_spawn] FATAL: {exc}", file=sys.stderr)
            sys.exit(2)
        print(f"[check_agent_spawn] SHADOW FATAL: {exc}", file=sys.stderr)
        sys.exit(0)
