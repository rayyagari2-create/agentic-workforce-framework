# Agentic Workforce Framework CLI

Scaffold the Agentic Workforce Framework into any repo in under 60 seconds.

## Install

Global install:

npm install -g agentic-workforce-framework

One-time use:

npx agentic-workforce-framework@latest init

## Commands

awf init       Scaffold the framework into your repo
awf add <module>   Add a specific module
awf check      Validate your setup
awf --version  Show version

## Modules

five-agent-team     Orchestrator, Frontend, Backend, QA, Fix agent files
trust-scoring       D1-D4 rubric, calibration anchors, TrustScore schema
failure-memory      Failure library, FailureRecord schema, example
task-manifest       AgentTaskManifest schema, sidecar schema, example
claude-code-hooks   Hook examples and Claude Code settings example file

## What this does

The CLI scaffolds Agentic Workforce Framework artifacts into your repo:
agent templates, trust scoring, failure memory, task manifests, schemas,
and Claude Code hook templates.

It does not run agents directly. It scaffolds the operating model around
your chosen runtime.

Runtimes execute agents. This framework governs agent work.

## Docs

https://github.com/rayyagari2-create/agentic-workforce-framework
