# agents/

Reference implementations of the governed agents in the framework. Each
file is a drop-in Claude Code slash command. They are the executable
counterpart to the role specs in `docs/architecture/agent-roster.md`.

## What this directory contains

| File | Role | Human equivalent |
|---|---|---|
| `orchestrator.md` | Plans, assigns, monitors, verifies the QA loop | Engineering Manager |
| `agent-srv.md` | Server-side logic, APIs, database migrations | Backend Engineer |
| `qa-agent.md` | Audits changed files or full codebase; never fixes | QA Lead |

Every agent in this directory is classified as **Agent** (stateful,
reasoning, governed) per `docs/architecture/agent-vs-service.md`. Each
runs under the bulletin protocol, acquires file locks before writing,
reads before writing, and writes a handoff on completion.

## How to install into Claude Code

Copy the agent file into your repo's `.claude/commands/` directory:

```
# from your project root
mkdir -p .claude/commands
cp /path/to/agentic-workforce-framework/agents/agent-srv.md .claude/commands/
```

Claude Code picks up slash commands from `.claude/commands/` on the next
session start. `agent-srv.md` becomes `/agent-srv`, `qa-agent.md` becomes
`/qa-agent`, and so on.

Orchestrator is the only agent you invoke manually. Once Orchestrator is
running, it spawns the executing agents with an `AgentTaskManifest` —
founders never hand-spawn Agent-SRV or QA-Agent.

## Trust tier at introduction

**Every agent starts PROVISIONAL.**

Trust is behavioral. It is earned across sessions, not granted by
install. See `docs/concepts/trust-scoring.md` for the D1–D4 dimensions
and `docs/concepts/autonomy-gates.md` for the PROVISIONAL → LOW →
MEDIUM → HIGH progression. A fresh install has `n_sessions < 5`, which
pins the agent to PROVISIONAL regardless of how well it performs on
any single task. Founders review every phase transition until the
confidence band lifts.

Do not edit trust files to "promote" an agent. Run the sessions.

## Customizing capability boundaries for your repo

The reference implementations encode a generic server/frontend split.
Your repo layout may differ. Before deploying, adjust:

1. **Boundary prefixes.** In `agent-srv.md`, the `OWNERSHIP — BOUNDARY
   RULE` section says "inside your configured server root." Replace
   with your actual prefix (e.g. `apps/api/`, `packages/server/`, or a
   list of prefixes for a monorepo). Do the same for the frontend
   agent. **Keep the rule "directory, not file type" intact.** The
   boundary is the path prefix. No exceptions, no judgment calls.

2. **File path placeholders.** Every `{path/to/...}` placeholder points
   to a governance artifact — bulletin, locks, handoffs, failure
   library, evolution queue, build status, knowledge base, QA reports.
   Decide where these live in your repo and replace the placeholders
   consistently across all agent files. The paths must match across
   Orchestrator, Agent-SRV, and QA-Agent or handoffs will land in the
   wrong place.

3. **Security rules section.** `agent-srv.md` has illustrative rules
   (model string pinning, prompt caching, sensitive-data routing,
   auth gates, rate limits). Keep the discipline (read at startup,
   grep after changes) and replace the specifics with what your
   codebase actually enforces. Cross-reference your own
   `security-rules.md` in the startup sequence.

4. **Handoff fields.** The `HANDOFF FORMAT` section lists fields
   (ENDPOINTS CHANGED, MIGRATIONS, CONTRACT CHANGES). Drop fields that
   do not apply; add fields your QA-Agent needs to verify claims
   against code. Keep every field verifiable — QA fails any claim it
   cannot confirm.

5. **Tool permissions and security gates.** The `PERMITTED TOOLS`
   section lists what the agent may run and which operations require
   founder confirmation. If your stack has other high-risk operations
   (infrastructure changes, third-party webhook registration, DNS),
   add them to the security-gates list.

Start with the smallest deviation that fits your repo. The governance
behavior (bulletin, locks, read-before-write, handoff, no self-spawn,
no self-scoring) must stay intact. Those are the spine.

## Further reading

- `docs/concepts/agentic-workforce-model.md` — why the "agents are
  employees" model, and what stateful/governed means in practice.
- `docs/operating-model/agent-lifecycle.md` — how an agent moves from
  introduction (PROVISIONAL) through promotion, demotion, and
  retirement.
- `docs/architecture/agent-roster.md` — the full roster, including
  agents that have not yet been published as reference
  implementations.

## Warning

**These are reference implementations. Customize before deploying.**

The boundary prefixes, security rules, and file paths in these files
reflect the assumptions of the reference project. Copying them into
your repo without adjustment will produce agents that look correct and
misroute work. Walk through the five-point customization list above
before your first Orchestrator session.

If an agent catches itself outside its boundary, its job is to stop
and escalate — not to silently adjust. The same rule applies to you
during setup: if something does not fit your repo, stop and adjust
the instruction file. Do not paper over the mismatch at runtime.
