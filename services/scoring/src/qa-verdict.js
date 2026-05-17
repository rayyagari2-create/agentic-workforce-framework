// ============================================================================
// services/scoring/src/qa-verdict.js
// E0-11: QA verdict production.
//
// Three exports:
//
//   produceQAVerdict(workItem, artifacts, contract)
//       Pure function. Evaluates every acceptance criterion declared on
//       the contract against the run's artifacts and returns a structured
//       QA verdict object that satisfies schemas/v1/qa-verdict.schema.json.
//
//       Verdict aggregation:
//         blocked          if any criterion result is 'blocked'
//         fail             else if any criterion result is 'fail'
//         pass_with_notes  else if any artifact warnings/notes exist OR
//                          the runtime was simulated (simulated runs
//                          never grant a clean pass)
//         pass             otherwise
//
//   writeVerdictToFile(verdict, outputPath)
//       Writes the verdict object as pretty-printed JSON to outputPath.
//       Default outputPath is <repoRoot>/demo-output/qa-verdict.json.
//
//   writeVerdictToDB(pool, verdict, scope)
//       Inserts a row into public.qa_verdicts. scope MUST carry
//       tenant_id, division_id, workspace_id, work_queue_item_id, and
//       agent_run_id — the table FKs require all five. The full verdict
//       object is stored in the evidence JSONB column; the outcome column
//       collapses to the PASS/FAIL enum the table currently exposes
//       (pass and pass_with_notes -> PASS; fail and blocked -> FAIL).
//
// Validation
//   The schema is compiled once at module load and reused. Each verdict
//   produced by produceQAVerdict is validated against the schema before
//   it is returned; an AJV failure throws so the caller cannot persist a
//   malformed verdict.
//
// Simulated execution
//   When artifacts.evidence.runtimeId === 'simulated' (or
//   artifacts.simulated === true) the function will never return a clean
//   'pass'. A pass-shaped run is downgraded to 'pass_with_notes' with an
//   automatic note explaining the downgrade. This matches the E0-11
//   contract: simulated runs are previews, not real verifications.
// ============================================================================

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '..', '..', '..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schemas', 'v1', 'qa-verdict.schema.json');

const SCHEMA   = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const ajv      = new Ajv2020({ strict: false });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

// ----------------------------------------------------------------------------
// ULID generation. Inlined to avoid a dependency for one identifier. Same
// implementation as services/execution/src/adapters/simulated.js.
// ----------------------------------------------------------------------------
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(value, length) {
    let n = BigInt(value);
    const base = 32n;
    const out = new Array(length);
    for (let i = length - 1; i >= 0; i--) {
        out[i] = CROCKFORD[Number(n % base)];
        n /= base;
    }
    return out.join('');
}

function ulid() {
    const time = encodeBase32(Date.now(), 10);
    const rand = randomBytes(10);
    let randInt = 0n;
    for (const b of rand) randInt = (randInt << 8n) | BigInt(b);
    return time + encodeBase32(randInt, 16);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isSimulatedRun(artifacts) {
    if (!artifacts || typeof artifacts !== 'object') return false;
    if (artifacts.simulated === true) return true;
    const rid = artifacts.evidence?.runtimeId;
    return typeof rid === 'string' && rid === 'simulated';
}

function hasWarningsOrNotes(artifacts) {
    if (!artifacts || typeof artifacts !== 'object') return false;
    const warnings = artifacts.warnings;
    if (Array.isArray(warnings) && warnings.length > 0) return true;
    const notes = artifacts.notes;
    if (Array.isArray(notes) && notes.length > 0) return true;
    if (typeof notes === 'string' && notes.trim().length > 0) return true;
    return false;
}

// Look up the agent-reported result for a single criterion. Agents
// report per-criterion outcomes via artifacts.criterion_results, an
// object keyed by criterion_id. Missing entries default to 'pass' for
// real runs — a criterion the agent did not even mention is treated as
// satisfied by default, on the assumption that an agent that wanted to
// fail or block a criterion would have said so.
function resolveCriterionResult(criterion, artifacts) {
    const reported = artifacts?.criterion_results?.[criterion.id];
    if (reported && typeof reported === 'object') {
        const result = reported.result;
        if (result === 'pass' || result === 'fail' || result === 'blocked') {
            return {
                result,
                evidence: typeof reported.evidence === 'string'
                    ? reported.evidence
                    : 'no evidence supplied',
            };
        }
    }
    return {
        result: 'pass',
        evidence: 'no per-criterion result reported; defaulted to pass',
    };
}

function aggregateVerdict(criteria, artifacts) {
    for (const c of criteria) {
        if (c.result === 'blocked') return 'blocked';
    }
    for (const c of criteria) {
        if (c.result === 'fail') return 'fail';
    }
    if (hasWarningsOrNotes(artifacts)) return 'pass_with_notes';
    return 'pass';
}

function toQADecisionLegacy(verdict) {
    return verdict === 'blocked' ? 'block_release' : verdict;
}

function buildSummaryFinding(verdict, criteria) {
    const failing = criteria.filter((c) => c.result === 'fail').length;
    const blocked = criteria.filter((c) => c.result === 'blocked').length;
    const severityByVerdict = {
        pass:            'info',
        pass_with_notes: 'info',
        fail:            'major',
        blocked:         'critical',
    };
    return {
        category: 'qa_summary',
        description:
            `verdict=${verdict}; criteria total=${criteria.length}, ` +
            `failed=${failing}, blocked=${blocked}`,
        severity: severityByVerdict[verdict] ?? 'info',
    };
}

// ----------------------------------------------------------------------------
// produceQAVerdict
// ----------------------------------------------------------------------------

export function produceQAVerdict(workItem, artifacts, contract) {
    if (!workItem || typeof workItem !== 'object') {
        throw new Error('produceQAVerdict: workItem is required');
    }

    const taskId = workItem.taskId ?? workItem.task_id;
    if (typeof taskId !== 'string' || !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(taskId)) {
        throw new Error(
            'produceQAVerdict: workItem.taskId must be a ULID-shaped string',
        );
    }

    const declared = Array.isArray(contract?.acceptanceCriteria)
        ? contract.acceptanceCriteria
        : Array.isArray(contract?.acceptance_criteria)
            ? contract.acceptance_criteria
            : [];

    if (declared.length === 0) {
        throw new Error(
            'produceQAVerdict: contract must declare at least one acceptance criterion',
        );
    }

    const criteria = declared.map((raw) => {
        const id   = raw.id   ?? raw.criterion_id;
        const text = raw.text ?? raw.criterion_text;
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error('produceQAVerdict: every criterion needs an id');
        }
        if (typeof text !== 'string' || text.length === 0) {
            throw new Error('produceQAVerdict: every criterion needs text');
        }
        const { result, evidence } = resolveCriterionResult({ id }, artifacts);
        return {
            criterion_id:   id,
            criterion_text: text,
            result,
            evidence,
        };
    });

    let verdict = aggregateVerdict(criteria, artifacts);

    // Simulated runs never produce a clean 'pass'. If aggregation landed
    // on 'pass' but the run was simulated, downgrade and record why so a
    // reviewer can see the downgrade was structural, not evidence-based.
    let simulatedDowngrade = false;
    if (verdict === 'pass' && isSimulatedRun(artifacts)) {
        verdict = 'pass_with_notes';
        simulatedDowngrade = true;
    }

    const findings = [buildSummaryFinding(verdict, criteria)];
    if (simulatedDowngrade) {
        findings.push({
            category:    'simulated_run',
            description: 'run was simulated; downgraded pass to pass_with_notes',
            severity:    'info',
        });
    }

    const out = {
        verdictId: ulid(),
        taskId,
        verdict,
        qaDecision: toQADecisionLegacy(verdict),
        criteria,
        findings,
        novelty: 'unknown',
        timestamp: new Date().toISOString(),
    };

    if (!validate(out)) {
        const msg = ajv.errorsText(validate.errors);
        throw new Error(`produceQAVerdict: AJV validation failed: ${msg}`);
    }

    return out;
}

// ----------------------------------------------------------------------------
// writeVerdictToFile
// ----------------------------------------------------------------------------

export function writeVerdictToFile(verdict, outputPath) {
    const target = outputPath ?? path.join(REPO_ROOT, 'demo-output', 'qa-verdict.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(verdict, null, 2) + '\n', 'utf8');
    return target;
}

// ----------------------------------------------------------------------------
// writeVerdictToDB
// ----------------------------------------------------------------------------

const INSERT_VERDICT_SQL = `
    INSERT INTO public.qa_verdicts (
        tenant_id, division_id, workspace_id,
        work_queue_item_id, agent_run_id,
        outcome, evidence, rationale
    ) VALUES (
        $1, $2, $3,
        $4, $5,
        $6::qa_verdict_outcome, $7::jsonb, $8
    )
    RETURNING id, outcome, created_at
`;

export async function writeVerdictToDB(pool, verdict, scope) {
    const required = [
        'tenant_id',
        'division_id',
        'workspace_id',
        'work_queue_item_id',
        'agent_run_id',
    ];
    for (const k of required) {
        if (!scope || typeof scope[k] !== 'string' || scope[k].length === 0) {
            throw new Error(`writeVerdictToDB: scope.${k} is required`);
        }
    }
    const outcome = (verdict.verdict === 'pass' || verdict.verdict === 'pass_with_notes')
        ? 'PASS'
        : 'FAIL';
    const rationale = verdict.findings?.[0]?.description ?? null;

    const r = await pool.query(INSERT_VERDICT_SQL, [
        scope.tenant_id,
        scope.division_id,
        scope.workspace_id,
        scope.work_queue_item_id,
        scope.agent_run_id,
        outcome,
        JSON.stringify(verdict),
        rationale,
    ]);
    return r.rows[0];
}

// Expose ULID for callers that need a stable identifier without
// depending on a third-party package.
export { ulid };
