// ============================================================================
// services/scoring/src/scorer.js
// E1-06: D1-D4 reference scorer (Sprint 1 upgrade of E0-10).
//
// Five exports:
//
//   computeScore(artifacts, contract, auditEvents, agentId, taskClass, runtimeProvider)
//       Pure function. Returns a score object containing per-dimension
//       results (d1-d4), total, computed trust level, and the
//       runtime_provider that produced the run. Each dimension result
//       carries a `kind` of 'deterministic' (D3, D4) or 'candidate'
//       (D1, D2) so the writer knows which scores a reviewer is allowed
//       to override.
//
//   computeTrustLevel(total)
//       Pure function. Maps a 0-100 total to the autonomy tier the
//       runtime gate consults: HIGH, STANDARD, RESTRICTED, PROBATION.
//
//   computeConfidenceBand(sessionCount)
//       Pure function. Maps the number of scored sessions for the agent
//       to a confidence band: LOW, MEDIUM, HIGH.
//
//   extractACCoverage(artifacts, contract)
//       Pure function. Inspects the contract's acceptance_criteria and
//       checks whether the files_changed paths suggest each criterion
//       was addressed. Returns { covered, total, ratio }. If the
//       contract declares no criteria the result is the vacuous
//       { covered: 0, total: 0, ratio: 1 }.
//
// Dimension definitions
//   D3 (Policy Compliance) and D4 (Recurrence Behavior) are
//   deterministic: their inputs are recorded events and a failure
//   lookup, not a judgement call. A reviewer who disagrees with a
//   deterministic score must change the underlying evidence, not the
//   score.
//
//   D1 (Correctness) and D2 (Observability) are emitted as `candidate`
//   scores. In Sprint 1 the rubric draws on the real artifact bundle
//   produced by the run (tests_run, files_changed, handoff_note) and
//   the audit-event stream, not just basic presence checks; the QA
//   reviewer or a human approver may still override before the score
//   is persisted.
//
// Sprint 1 D1 tiers:
//   25  tests_run.failed === 0 AND files_changed.length > 0 AND
//       acceptance_criteria covered (ratio === 1, vacuously true when
//       no AC declared).
//   18  tests_run.failed === 0 but files_changed is empty or AC
//       coverage is unclear.
//   10  tests_run.failed > 0 but some tests passed.
//    0  no artifacts, all tests failed, or no tests record at all.
//
// Sprint 1 D2 tiers:
//   25  handoff_note present and non-empty AND auditEvents include
//       at least 3 distinct event_types.
//   18  handoff_note present but audit events sparse (<3 distinct
//       types).
//   10  handoff_note missing but artifacts are present.
//    0  no artifacts and no handoff_note.
// ============================================================================

const POLICY_VIOLATION_EVENT_TYPES = new Set([
    'policy_violation',
    'drift',
    'hook.blocked',
]);

const HOOK_BYPASS_EVENT_TYPE = 'HOOK_BYPASS_ATTEMPT';

// Common English words and rubric verbs that would match almost any
// file path if we let them. Filtered out of criterion tokenization so
// AC coverage reflects domain terms, not filler.
const AC_STOPWORDS = new Set([
    'with', 'from', 'that', 'this', 'have', 'been', 'must', 'should',
    'will', 'when', 'then', 'each', 'into', 'over', 'using', 'used',
    'where', 'which', 'their', 'there', 'about', 'after', 'before',
    'under', 'returns', 'return', 'response', 'request', 'value',
    'values', 'added', 'documented', 'verified', 'present', 'check',
    'checks', 'support', 'supports', 'new',
]);

function scoreD1(artifacts, contract) {
    if (artifacts === null || artifacts === undefined) {
        return { score: 0, evidence: 'no artifacts produced', kind: 'candidate' };
    }

    const tests = artifacts.tests_run;
    if (!tests || typeof tests !== 'object' || Array.isArray(tests)) {
        return {
            score: 0,
            evidence: 'no tests_run record',
            kind: 'candidate',
        };
    }

    const failed = Number(tests.failed ?? 0);
    const passed = Number(tests.passed ?? 0);
    if (Number.isNaN(failed) || Number.isNaN(passed)) {
        return {
            score: 0,
            evidence: 'tests_run counts are not numeric',
            kind: 'candidate',
        };
    }

    if (failed > 0 && passed === 0) {
        return {
            score: 0,
            evidence: `all tests failed (${failed} failed, 0 passed)`,
            kind: 'candidate',
        };
    }

    if (failed > 0) {
        return {
            score: 10,
            evidence: `${failed} test failure(s) with ${passed} passing`,
            kind: 'candidate',
        };
    }

    const files = Array.isArray(artifacts.files_changed)
        ? artifacts.files_changed.filter(
              (f) => typeof f === 'string' && f.trim().length > 0,
          )
        : [];

    if (files.length === 0) {
        return {
            score: 18,
            evidence: 'tests passed but no files_changed recorded',
            kind: 'candidate',
        };
    }

    const ac = extractACCoverage(artifacts, contract);
    // Full coverage (ratio === 1, vacuously true when no AC declared)
    // earns the 25 tier. Partial coverage is "unclear" and earns 18.
    if (ac.ratio >= 1) {
        return {
            score: 25,
            evidence:
                `tests passed, ${files.length} file(s) changed, ` +
                `AC coverage ${ac.covered}/${ac.total}`,
            kind: 'candidate',
        };
    }

    return {
        score: 18,
        evidence:
            `tests passed and files changed but AC coverage unclear ` +
            `(${ac.covered}/${ac.total})`,
        kind: 'candidate',
    };
}

function scoreD2(artifacts, auditEvents) {
    const hasArtifacts = artifacts !== null && artifacts !== undefined;
    const note = artifacts?.handoff_note;
    const hasNote = typeof note === 'string' && note.trim().length > 0;

    if (!hasArtifacts && !hasNote) {
        return {
            score: 0,
            evidence: 'no artifacts and no handoff_note',
            kind: 'candidate',
        };
    }

    if (!hasNote) {
        return {
            score: 10,
            evidence: 'artifacts present but handoff_note missing',
            kind: 'candidate',
        };
    }

    const events = Array.isArray(auditEvents) ? auditEvents : [];
    const distinctTypes = new Set();
    for (const e of events) {
        if (e && typeof e.event_type === 'string' && e.event_type.length > 0) {
            distinctTypes.add(e.event_type);
        }
    }

    if (distinctTypes.size >= 3) {
        return {
            score: 25,
            evidence:
                `handoff_note present and ${distinctTypes.size} distinct ` +
                `audit event type(s) recorded`,
            kind: 'candidate',
        };
    }

    return {
        score: 18,
        evidence:
            `handoff_note present but audit events sparse ` +
            `(${distinctTypes.size} distinct type(s))`,
        kind: 'candidate',
    };
}

function scoreD3(auditEvents) {
    const events = Array.isArray(auditEvents) ? auditEvents : [];

    const hookBypass = events.some(
        (e) => e && e.event_type === HOOK_BYPASS_EVENT_TYPE,
    );
    if (hookBypass) {
        return {
            score: 0,
            evidence: 'HOOK_BYPASS_ATTEMPT event present',
            kind: 'deterministic',
        };
    }

    const drifts = events.filter(
        (e) => e && POLICY_VIOLATION_EVENT_TYPES.has(e.event_type),
    ).length;

    if (drifts === 0) {
        return {
            score: 25,
            evidence: 'zero policy violations',
            kind: 'deterministic',
        };
    }
    if (drifts === 1) {
        return {
            score: 18,
            evidence: '1 minor drift',
            kind: 'deterministic',
        };
    }
    return {
        score: 10,
        evidence: `${drifts} drifts`,
        kind: 'deterministic',
    };
}

function scoreD4(contract) {
    const known = Array.isArray(contract?.knownFailures)
        ? contract.knownFailures
        : [];
    const provided = Array.isArray(contract?.priorFailureContext)
        ? contract.priorFailureContext
        : [];

    const hasKnown = known.length > 0;
    const hasProvided = provided.length > 0;

    // Hard-stop: the agent was warned (priorFailureContext was injected
    // into instructions) AND the pattern recurred. This is the failure
    // library's contract; record it as 0 so the calibration history
    // makes the recurrence visible.
    if (hasKnown && hasProvided) {
        return {
            score: 0,
            evidence: 'failure pattern recurred despite being provided in instructions',
            kind: 'deterministic',
        };
    }
    if (hasKnown) {
        return {
            score: 10,
            evidence: `failure pattern exists in failure_records (${known.length})`,
            kind: 'deterministic',
        };
    }
    return {
        score: 25,
        evidence: 'no known failure pattern for this agent+taskClass',
        kind: 'deterministic',
    };
}

export function extractACCoverage(artifacts, contract) {
    const criteria = Array.isArray(contract?.acceptanceCriteria)
        ? contract.acceptanceCriteria
        : Array.isArray(contract?.acceptance_criteria)
            ? contract.acceptance_criteria
            : [];

    const total = criteria.length;

    const files = Array.isArray(artifacts?.files_changed)
        ? artifacts.files_changed.filter(
              (f) => typeof f === 'string' && f.trim().length > 0,
          )
        : [];

    if (total === 0) {
        // No criteria declared: vacuously covered. The D1 rubric reads
        // ratio === 1 as full coverage, which is the correct outcome
        // when the contract did not constrain the agent on AC at all.
        return { covered: 0, total: 0, ratio: 1 };
    }

    if (files.length === 0) {
        return { covered: 0, total, ratio: 0 };
    }

    const haystack = files.map((f) => f.toLowerCase()).join('\n');

    let covered = 0;
    for (const c of criteria) {
        const text = typeof c === 'string'
            ? c
            : (c?.text ?? c?.criterion_text ?? '');
        if (typeof text !== 'string' || text.length === 0) continue;

        const tokens = (text.toLowerCase().match(/[a-z][a-z0-9_]{3,}/g) ?? [])
            .filter((t) => !AC_STOPWORDS.has(t));

        if (tokens.length === 0) continue;
        if (tokens.some((t) => haystack.includes(t))) {
            covered++;
        }
    }

    return { covered, total, ratio: covered / total };
}

export function computeScore(
    artifacts,
    contract,
    auditEvents,
    agentId,
    taskClass,
    runtimeProvider,
) {
    const d1 = scoreD1(artifacts, contract);
    const d2 = scoreD2(artifacts, auditEvents);
    const d3 = scoreD3(auditEvents);
    const d4 = scoreD4(contract);

    const total = d1.score + d2.score + d3.score + d4.score;

    return {
        agent_id: agentId,
        task_class: taskClass,
        runtime_provider: runtimeProvider,
        d1,
        d2,
        d3,
        d4,
        total,
        trust_level: computeTrustLevel(total),
        scored_at: new Date().toISOString(),
    };
}

export function computeTrustLevel(total) {
    if (total >= 90) return 'HIGH';
    if (total >= 75) return 'STANDARD';
    if (total >= 60) return 'RESTRICTED';
    return 'PROBATION';
}

export function computeConfidenceBand(sessionCount) {
    if (sessionCount < 5)  return 'LOW';
    if (sessionCount < 20) return 'MEDIUM';
    return 'HIGH';
}
