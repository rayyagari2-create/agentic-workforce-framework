#!/usr/bin/env node
// ============================================================================
// examples/awf-demo/src/run-demo.js
// E0-12: Sprint 0 end-to-end demo entry point.
//
// One command, nine steps. Ties together every Sprint 0 building block
// using only the production code paths — no shortcuts, no inline
// re-implementations. If a step breaks here, it is the same break a real
// caller would see.
//
//   1. Intake          load examples/awf-demo/sample-backlog.json into
//                      public.work_queue_items (services/governance/src/intake.js).
//   2. Classify        run the risk classifier on all 5 tickets
//                      (services/governance/src/classifier.js).
//   3. Claim           SELECT FOR UPDATE SKIP LOCKED the highest-priority
//                      eligible item (services/governance/src/queue.js).
//   4. Approval gate   HIGH risk requires approval; demo auto-approves
//                      (services/governance/src/approvals.js).
//   5. Assign          route task_class -> role and pin the agent_instance
//                      (services/governance/src/assigner.js).
//   6. Simulated run   SimulatedRuntimeAdapter produces [PREVIEW] artifacts
//                      (services/execution/src/adapters/simulated.js);
//                      a matching public.agent_runs row is inserted so
//                      the QA verdict and trust score can FK to it.
//   7. QA verdict      produceQAVerdict against simulated artifacts;
//                      verdict MUST collapse to pass_with_notes for any
//                      simulated run (services/scoring/src/qa-verdict.js).
//   8. Score           D1-D4 reference scorer; D1/D2 are candidate,
//                      D3/D4 are deterministic (services/scoring/src/scorer.js).
//   9. Audit verify    every step above emits an audit event through
//                      the running audit-service. At the end we shell out
//                      to `awf audit verify`, which recomputes the chain
//                      and prints the per-runtime breakdown.
//
// Audit service
//   The audit service is a separate process by design (see
//   services/audit-service/index.js). On boot the demo probes
//   GET http://127.0.0.1:8787/health; if nothing answers the demo spawns
//   the service itself and waits for /health to return 200 before
//   continuing. The spawned process is sent SIGTERM on exit.
//
// Idempotency
//   The demo wipes work_queue_items in the demo workspace at the start
//   (FK CASCADE clears approval_requests, agent_runs, qa_verdicts, and
//   trust_scores for the same workspace). audit.events is append-only by
//   schema and is never touched here.
//
// Run
//   node examples/awf-demo/src/run-demo.js
//
// Environment
//   DATABASE_URL   required; read from .env at the repo root or the shell.
//   AUDIT_PORT     optional; defaults to 8787 (matches audit-service).
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { classifyAll } from '../../../services/governance/src/classifier.js';
import { claimNextEligibleItem } from '../../../services/governance/src/queue.js';
import {
    requiresApproval,
    requestApproval,
    approveItem,
} from '../../../services/governance/src/approvals.js';
import { assignAgent } from '../../../services/governance/src/assigner.js';
import { databaseUrl } from '../../../services/governance/src/env.js';
import { SimulatedRuntimeAdapter } from '../../../services/execution/src/adapters/simulated.js';
import {
    produceQAVerdict,
    writeVerdictToFile,
    writeVerdictToDB,
    ulid,
} from '../../../services/scoring/src/qa-verdict.js';
import { computeScore } from '../../../services/scoring/src/scorer.js';
import { writeScore } from '../../../services/scoring/src/trust-store.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '..', '..', '..');

const DEMO_TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID  = '00000000-0000-0000-0000-000000000010';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

const BACKLOG_PATH    = path.join(REPO_ROOT, 'examples', 'awf-demo', 'sample-backlog.json');
const DEMO_OUTPUT_DIR = path.join(REPO_ROOT, 'demo-output');
const AUDIT_LOG_PATH  = path.join(DEMO_OUTPUT_DIR, 'audit-log.jsonl');

const AUDIT_PORT = parseInt(process.env.AUDIT_PORT || '8787', 10);
const AUDIT_HOST = '127.0.0.1';

const CORRELATION_ID = `demo-${randomUUID()}`;

let spawnedAudit = null;

// ----------------------------------------------------------------------------
// Display helpers
// ----------------------------------------------------------------------------
const BOLD = '\x1b[1m';
const DIM  = '\x1b[2m';
const RED  = '\x1b[31m';
const OFF  = '\x1b[0m';

function section(n, title) {
    process.stdout.write(`\n${BOLD}=== Step ${n}: ${title} ===${OFF}\n`);
}

function info(msg) {
    process.stdout.write(`  ${msg}\n`);
}

function preview(msg) {
    process.stdout.write(`  [PREVIEW] ${msg}\n`);
}

// ----------------------------------------------------------------------------
// Audit service HTTP client
// ----------------------------------------------------------------------------
function httpRequest(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const data = body ? Buffer.from(JSON.stringify(body)) : null;
        const req = http.request(
            {
                host: AUDIT_HOST,
                port: AUDIT_PORT,
                path: urlPath,
                method,
                headers: data
                    ? {
                          'content-type': 'application/json',
                          'content-length': data.length,
                      }
                    : {},
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let parsed = null;
                    try { parsed = raw ? JSON.parse(raw) : null; } catch {}
                    resolve({ status: res.statusCode, body: parsed, raw });
                });
            },
        );
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function isAuditHealthy() {
    try {
        const r = await httpRequest('GET', '/health');
        return r.status === 200;
    } catch {
        return false;
    }
}

async function ensureAuditService() {
    if (await isAuditHealthy()) {
        info(`audit-service already running on http://${AUDIT_HOST}:${AUDIT_PORT}`);
        return;
    }
    info('audit-service not detected; starting it as a child process...');
    const auditScript = path.join(REPO_ROOT, 'services', 'audit-service', 'index.js');
    spawnedAudit = spawn(process.execPath, [auditScript], {
        cwd: REPO_ROOT,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    spawnedAudit.stdout.on('data', (d) => {
        process.stdout.write(`${DIM}  [audit] ${d.toString().trimEnd()}${OFF}\n`);
    });
    spawnedAudit.stderr.on('data', (d) => {
        process.stderr.write(`${DIM}  [audit] ${d.toString().trimEnd()}${OFF}\n`);
    });
    spawnedAudit.on('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            process.stderr.write(`  [audit] exited unexpectedly (code=${code}, signal=${signal})\n`);
        }
    });

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        await sleep(150);
        if (await isAuditHealthy()) {
            info(`audit-service ready on http://${AUDIT_HOST}:${AUDIT_PORT}`);
            return;
        }
    }
    throw new Error('audit-service failed to come up within 10s');
}

async function stopSpawnedAuditService() {
    if (!spawnedAudit) return;
    info('stopping the audit-service child process...');
    const exited = new Promise((resolve) => spawnedAudit.once('exit', resolve));
    spawnedAudit.kill('SIGTERM');
    await Promise.race([exited, sleep(3_000)]);
    spawnedAudit = null;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ----------------------------------------------------------------------------
// Audit event emission + on-disk mirror
// ----------------------------------------------------------------------------
async function emitEvent({
    event_type,
    subject_table,
    subject_id,
    event_data,
    rationale,
    runtime_provider,
}) {
    const payload = {
        tenant_id:        DEMO_TENANT_ID,
        division_id:      DEMO_DIVISION_ID,
        workspace_id:     DEMO_WORKSPACE_ID,
        actor_type:       'system',
        actor_id:         'demo-runner',
        event_type,
        subject_table:    subject_table ?? null,
        subject_id:       subject_id ?? null,
        event_data:       event_data ?? null,
        rationale:        rationale ?? null,
        correlation_id:   CORRELATION_ID,
        runtime_provider: runtime_provider ?? 'pre_execution',
    };
    const r = await httpRequest('POST', '/events', payload);
    if (r.status !== 201) {
        throw new Error(`audit POST /events failed (${r.status}): ${r.raw}`);
    }
    const merged = { ...payload, id: r.body.id, event_hash: r.body.event_hash };
    fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(merged) + '\n');
    return r.body;
}

// ----------------------------------------------------------------------------
// Child process helpers
// ----------------------------------------------------------------------------
function runChild(scriptPath, args = []) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [scriptPath, ...args], {
            cwd: REPO_ROOT,
            env: process.env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', reject);
        child.on('exit', (code) => resolve({ code, stdout, stderr }));
    });
}

function runIntake() {
    return runChild(
        path.join(REPO_ROOT, 'services', 'governance', 'src', 'intake.js'),
        [BACKLOG_PATH],
    );
}

function runAwfAuditVerify() {
    return runChild(
        path.join(REPO_ROOT, 'packages', 'awf-cli', 'bin', 'awf.js'),
        ['audit', 'verify'],
    );
}

// ----------------------------------------------------------------------------
// Domain helpers
// ----------------------------------------------------------------------------

// Parse "- [ ] criterion text" lines out of a GitHub issue body. The
// demo backlog encodes acceptance criteria in markdown checklist form;
// the QA verdict producer needs them as { id, text } pairs.
function extractAcceptanceCriteria(description) {
    if (typeof description !== 'string') {
        return [{ id: 'AC-1', text: 'implementation matches the work item description' }];
    }
    const out = [];
    let n = 1;
    for (const line of description.split('\n')) {
        const m = line.match(/^\s*-\s*\[\s*\]\s+(.+?)\s*$/);
        if (m) out.push({ id: `AC-${n++}`, text: m[1] });
    }
    if (out.length === 0) {
        out.push({ id: 'AC-1', text: 'implementation matches the work item description' });
    }
    return out;
}

async function resetDemoWorkspace(pool) {
    const r = await pool.query(
        `DELETE FROM public.work_queue_items WHERE workspace_id = $1`,
        [DEMO_WORKSPACE_ID],
    );
    return r.rowCount;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
    process.stdout.write(`${BOLD}AWF Sprint 0 demo — single command, end to end${OFF}\n`);
    process.stdout.write(`correlation_id: ${CORRELATION_ID}\n`);
    process.stdout.write(`database:       ${databaseUrl()}\n`);

    fs.mkdirSync(DEMO_OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(AUDIT_LOG_PATH, '');

    section(0, 'Bring up audit service');
    await ensureAuditService();

    const pool = new Pool({ connectionString: databaseUrl() });

    try {
        await emitEvent({
            event_type: 'demo.started',
            rationale:  'Sprint 0 E0-12 demo entry point',
            event_data: { correlation_id: CORRELATION_ID },
        });

        section('1a', 'Reset demo workspace state');
        const cleared = await resetDemoWorkspace(pool);
        info(`cleared ${cleared} prior work item(s) from workspace ${DEMO_WORKSPACE_ID}`);
        info('(cascades wiped approval_requests, agent_runs, qa_verdicts, trust_scores)');

        // ------------------------------------------------------------------
        // 1. Intake
        // ------------------------------------------------------------------
        section(1, 'Load work items from sample-backlog.json');
        const intakeRes = await runIntake();
        if (intakeRes.stdout) process.stdout.write(prefixLines(intakeRes.stdout, '  '));
        if (intakeRes.stderr) process.stderr.write(prefixLines(intakeRes.stderr, '  '));
        if (intakeRes.code !== 0) {
            throw new Error(`intake exited with code ${intakeRes.code}`);
        }
        await emitEvent({
            event_type:    'workitem.intake_completed',
            subject_table: 'work_queue_items',
            event_data:    { backlog: 'examples/awf-demo/sample-backlog.json' },
            rationale:     'loaded sample backlog',
        });

        // ------------------------------------------------------------------
        // 2. Classify
        // ------------------------------------------------------------------
        section(2, 'Run risk classifier on all 5 tickets');
        const classified = await classifyAll();
        process.stdout.write('\n');
        const header =
            `  ${'task_id'.padEnd(12)}  ${'risk'.padEnd(7)}  ` +
            `${'task_class'.padEnd(28)}  title`;
        process.stdout.write(header + '\n');
        process.stdout.write('  ' + '-'.repeat(header.length - 2) + '\n');
        for (const r of classified) {
            process.stdout.write(
                `  ${r.task_id.padEnd(12)}  ${r.risk_level.padEnd(7)}  ` +
                `${r.task_class.padEnd(28)}  ${r.title}\n`,
            );
        }
        await emitEvent({
            event_type:    'workitem.classified',
            subject_table: 'work_queue_items',
            event_data:    { count: classified.length },
            rationale:     'risk classifier ran over the demo backlog',
        });

        // ------------------------------------------------------------------
        // 3. Claim
        // ------------------------------------------------------------------
        section(3, 'Claim highest-priority eligible ticket (SKIP LOCKED)');
        const claimed = await claimNextEligibleItem(pool, DEMO_WORKSPACE_ID);
        if (!claimed) throw new Error('no eligible work item to claim');
        info(
            `claimed ${claimed.task_id} ` +
            `(priority=${claimed.priority}, risk=${claimed.risk_level}, status=${claimed.status})`,
        );
        info(`  title: ${claimed.title}`);
        await emitEvent({
            event_type:    'workitem.claimed',
            subject_table: 'work_queue_items',
            subject_id:    claimed.id,
            event_data:    {
                task_id:    claimed.task_id,
                priority:   claimed.priority,
                risk_level: claimed.risk_level,
            },
        });

        const fullRow = (
            await pool.query(
                `SELECT id, task_id, title, description, labels, task_class,
                        risk_level, status, priority
                   FROM public.work_queue_items WHERE id = $1`,
                [claimed.id],
            )
        ).rows[0];

        // ------------------------------------------------------------------
        // 4. Approval gate
        // ------------------------------------------------------------------
        section(4, 'Approval gate fires for HIGH risk; auto-approve in demo mode');
        if (!requiresApproval(fullRow)) {
            throw new Error(
                `expected ${fullRow.task_id} to require approval, got risk_level=${fullRow.risk_level}`,
            );
        }
        info(`risk_level=${fullRow.risk_level} -> approval required`);
        const requestRow = await requestApproval(pool, fullRow.id, 'human-approver');
        info(
            `approval_requests row=${requestRow.id} ` +
            `(status=${requestRow.status}, required_role=${requestRow.required_role})`,
        );
        await emitEvent({
            event_type:    'approval.requested',
            subject_table: 'approval_requests',
            subject_id:    requestRow.id,
            event_data:    {
                work_queue_item_id: fullRow.id,
                required_role:      'human-approver',
            },
            rationale: `HIGH risk gate for ${fullRow.task_id}`,
        });
        const decided = await approveItem(
            pool,
            fullRow.id,
            'demo-auto-approver',
            'auto-approved by demo runner',
        );
        info(
            `approved: approver_id=${decided.approver_id}, ` +
            `status=${decided.status}, rationale="${decided.rationale}"`,
        );
        await emitEvent({
            event_type:    'approval.approved',
            subject_table: 'approval_requests',
            subject_id:    decided.id,
            event_data:    { approver_id: decided.approver_id },
            rationale:     'auto-approved in demo mode',
        });

        // ------------------------------------------------------------------
        // 5. Assign agent
        // ------------------------------------------------------------------
        section(5, 'Assign the correct agent for the task class');
        const assigned = await assignAgent(pool, fullRow.id);
        info(`task_class=${assigned.task_class} -> role=${assigned.role}`);
        info(
            `assigned_agent_instance_id=${assigned.assigned_agent_instance_id}, ` +
            `status=${assigned.status}`,
        );
        await emitEvent({
            event_type:    'workitem.assigned',
            subject_table: 'work_queue_items',
            subject_id:    fullRow.id,
            event_data:    {
                role:               assigned.role,
                task_class:         assigned.task_class,
                agent_instance_id:  assigned.assigned_agent_instance_id,
            },
        });

        // ------------------------------------------------------------------
        // 6. Simulated runtime
        // ------------------------------------------------------------------
        section(6, 'Run SimulatedRuntimeAdapter (all artifacts prefixed [PREVIEW])');
        const adapter = new SimulatedRuntimeAdapter();
        const acceptanceCriteria = extractAcceptanceCriteria(fullRow.description);
        const contract = {
            // ULID required by produceQAVerdict for the synthetic taskId. The
            // work_queue_items.task_id stored at intake is the external
            // reference ("github:102"), so we mint a ULID for the verdict's
            // taskId field and carry the external ref in evidence.
            taskId: ulid(),
            title:  fullRow.title,
            acceptanceCriteria,
            knownFailures:       [],
            priorFailureContext: [],
        };
        adapter.onEvent((evt) => {
            preview(`runtime event: ${evt.type} runId=${evt.runId}`);
        });
        const runHandle = await adapter.startTask(contract);
        info(
            `runtime=${adapter.runtimeId}, runId=${runHandle.runId}, ` +
            `session=${runHandle.runtimeSessionId}`,
        );
        const status = await adapter.getStatus(runHandle.runId);
        info(`status=${status.status}, progress=${status.progress}`);
        const artifacts = await adapter.getArtifacts(runHandle.runId);
        preview(artifacts.diff_summary);
        for (const f of artifacts.files_changed) preview(`files_changed: ${f}`);
        for (const c of artifacts.commands_run) preview(`commands_run:  ${c}`);
        for (const t of artifacts.tests_run) {
            preview(`tests_run:     ${t.name} -> ${t.status} (${t.duration_ms}ms)`);
        }
        preview(`handoff_note:  ${artifacts.handoff_note}`);

        const agentRunRow = (
            await pool.query(
                `INSERT INTO public.agent_runs (
                     tenant_id, division_id, workspace_id,
                     work_queue_item_id, agent_instance_id,
                     runtime_provider, status,
                     started_at, completed_at,
                     output, correlation_id
                 ) VALUES (
                     $1, $2, $3,
                     $4, $5,
                     $6, 'succeeded'::agent_run_status,
                     NOW(), NOW(),
                     $7::jsonb, $8
                 )
                 RETURNING id, runtime_provider, status`,
                [
                    DEMO_TENANT_ID, DEMO_DIVISION_ID, DEMO_WORKSPACE_ID,
                    fullRow.id, assigned.assigned_agent_instance_id,
                    adapter.runtimeId,
                    JSON.stringify({
                        runId:             runHandle.runId,
                        runtimeSessionId:  runHandle.runtimeSessionId,
                        artifacts,
                    }),
                    CORRELATION_ID,
                ],
            )
        ).rows[0];
        info(`agent_runs row=${agentRunRow.id} (runtime_provider=${agentRunRow.runtime_provider})`);
        await emitEvent({
            event_type:       'runtime.task_completed',
            subject_table:    'agent_runs',
            subject_id:       agentRunRow.id,
            event_data:       {
                runtime_provider: adapter.runtimeId,
                runtime_run_id:   runHandle.runId,
            },
            rationale:        'SimulatedRuntimeAdapter produced preview artifacts',
            runtime_provider: adapter.runtimeId,
        });

        // Enrich the artifacts with per-criterion results so the QA
        // producer evaluates each criterion against named evidence instead
        // of defaulting them. The verdict will still downgrade to
        // pass_with_notes because the runtime is simulated.
        const enrichedArtifacts = {
            ...artifacts,
            criterion_results: Object.fromEntries(
                acceptanceCriteria.map((c) => [
                    c.id,
                    {
                        result:   'pass',
                        evidence: '[PREVIEW] simulated runtime asserts this criterion holds',
                    },
                ]),
            ),
        };

        // ------------------------------------------------------------------
        // 7. QA verdict
        // ------------------------------------------------------------------
        section(7, 'Produce QA verdict (simulated runs collapse to pass_with_notes)');
        const verdictWorkItem = { taskId: contract.taskId, title: fullRow.title };
        const verdict = produceQAVerdict(verdictWorkItem, enrichedArtifacts, contract);
        info(`verdict=${verdict.verdict} (qaDecision=${verdict.qaDecision})`);
        info(`criteria evaluated: ${verdict.criteria.length}`);
        for (const f of verdict.findings) {
            info(`  finding: [${f.severity}] ${f.category} - ${f.description}`);
        }
        if (verdict.verdict !== 'pass_with_notes') {
            throw new Error(
                `expected pass_with_notes for a simulated run, got ${verdict.verdict}`,
            );
        }
        const writtenPath = writeVerdictToFile(
            verdict,
            path.join(DEMO_OUTPUT_DIR, 'qa-verdict.json'),
        );
        info(`verdict written to ${path.relative(REPO_ROOT, writtenPath)}`);
        const verdictDbRow = await writeVerdictToDB(pool, verdict, {
            tenant_id:          DEMO_TENANT_ID,
            division_id:        DEMO_DIVISION_ID,
            workspace_id:       DEMO_WORKSPACE_ID,
            work_queue_item_id: fullRow.id,
            agent_run_id:       agentRunRow.id,
        });
        info(`qa_verdicts row=${verdictDbRow.id} (outcome=${verdictDbRow.outcome})`);
        await emitEvent({
            event_type:       'qa.verdict_produced',
            subject_table:    'qa_verdicts',
            subject_id:       verdictDbRow.id,
            event_data:       { outcome: verdictDbRow.outcome, verdict: verdict.verdict },
            rationale:        verdict.findings?.[0]?.description ?? null,
            runtime_provider: adapter.runtimeId,
        });

        // ------------------------------------------------------------------
        // 8. D1-D4 score
        // ------------------------------------------------------------------
        section(8, 'Compute D1-D4 scores (D1/D2 candidate, D3/D4 deterministic)');
        const score = computeScore(
            enrichedArtifacts,
            contract,
            [],
            assigned.assigned_agent_instance_id,
            assigned.task_class,
            adapter.runtimeId,
        );
        const dimLine = (label, d) => {
            info(
                `  ${label}  [${d.kind.padEnd(13)}]  ` +
                `score=${String(d.score).padStart(2)}  - ${d.evidence}`,
            );
        };
        dimLine('D1 correctness  ', score.d1);
        dimLine('D2 observability', score.d2);
        dimLine('D3 policy       ', score.d3);
        dimLine('D4 recurrence   ', score.d4);
        info(`total=${score.total} -> trust_level=${score.trust_level}`);
        const scoreRow = await writeScore(pool, {
            ...score,
            tenant_id:         DEMO_TENANT_ID,
            division_id:       DEMO_DIVISION_ID,
            workspace_id:      DEMO_WORKSPACE_ID,
            agent_instance_id: assigned.assigned_agent_instance_id,
            agent_run_id:      agentRunRow.id,
            correlation_id:    CORRELATION_ID,
            rationale:         'demo-end-to-end',
        });
        info(
            `trust_scores row=${scoreRow.id} ` +
            `(total_score=${scoreRow.total_score}, tier=${scoreRow.tier})`,
        );
        await emitEvent({
            event_type:       'scoring.computed',
            subject_table:    'trust_scores',
            subject_id:       scoreRow.id,
            event_data:       {
                d1:    score.d1.score,
                d2:    score.d2.score,
                d3:    score.d3.score,
                d4:    score.d4.score,
                total: score.total,
                tier:  score.trust_level,
            },
            runtime_provider: adapter.runtimeId,
        });

        // ------------------------------------------------------------------
        // 9. Audit verify
        // ------------------------------------------------------------------
        section(9, 'Audit verify');
        await emitEvent({
            event_type: 'demo.completed',
            rationale:  'all nine steps executed',
        });
        info(`event mirror: ${path.relative(REPO_ROOT, AUDIT_LOG_PATH)}`);
        info('shelling out to: awf audit verify');
        process.stdout.write('\n');
        const verifyOut = await runAwfAuditVerify();
        if (verifyOut.stdout) process.stdout.write(prefixLines(verifyOut.stdout, '  '));
        if (verifyOut.stderr) process.stderr.write(prefixLines(verifyOut.stderr, '  '));
        if (verifyOut.code !== 0) {
            throw new Error(`awf audit verify exited with code ${verifyOut.code}`);
        }

        process.stdout.write(
            `\n${BOLD}Sprint 2: Same governance model across Claude Code and Codex.${OFF}\n` +
            `Public demo uses simulated/sanitized evidence; real adapters remain private.\n`,
        );
    } finally {
        await pool.end().catch(() => {});
        await stopSpawnedAuditService().catch(() => {});
    }
}

function prefixLines(text, prefix) {
    return text
        .split('\n')
        .map((line, idx, arr) => (idx === arr.length - 1 && line === '' ? '' : prefix + line))
        .join('\n');
}

main().catch(async (err) => {
    process.stderr.write(`\n${RED}demo failed:${OFF} ${err.message}\n`);
    if (err.stack) process.stderr.write(err.stack + '\n');
    await stopSpawnedAuditService().catch(() => {});
    process.exit(1);
});
