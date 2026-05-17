// services/scoring/test/scorer.test.js
//
// Covers the deterministic D3 and D4 rules from services/scoring/src/scorer.js,
// plus the tier and confidence-band thresholds. Pure functions; no DB.
// Runs as a plain script:
//   node test/scorer.test.js
// A non zero exit indicates failure. Uses node:assert/strict to match
// the governance suite.

import assert from 'node:assert/strict';
import {
    computeScore,
    computeTrustLevel,
    computeConfidenceBand,
} from '../src/scorer.js';

const AGENT_ID = 'agent-srv';
const TASK_CLASS = 'api_development';
const RUNTIME = 'simulated';

// A clean, full-credit artifact bundle. Reused by D3/D4 cases so the
// dimension under test is the only thing changing.
const CLEAN_ARTIFACTS = {
    tests_run: { passed: 5, failed: 0 },
    handoff_note:
        'Implemented POST /widgets, added integration test, documented the new error envelope.',
};

const EMPTY_CONTRACT = { knownFailures: [], priorFailureContext: [] };

function score(opts) {
    return computeScore(
        opts.artifacts        ?? CLEAN_ARTIFACTS,
        opts.contract         ?? EMPTY_CONTRACT,
        opts.auditEvents      ?? [],
        opts.agentId          ?? AGENT_ID,
        opts.taskClass        ?? TASK_CLASS,
        opts.runtimeProvider  ?? RUNTIME,
    );
}

// ----------------------------------------------------------------------------
// D3 deterministic rules.
//   25 if zero policy violations
//   18 if one minor drift
//   10 if multiple drifts
//    0 if any HOOK_BYPASS_ATTEMPT event
// ----------------------------------------------------------------------------

// D3 / case 1: empty audit log -> 25, kind=deterministic.
{
    const s = score({ auditEvents: [] });
    assert.equal(s.d3.score, 25, 'D3: empty audit log must score 25');
    assert.equal(s.d3.kind, 'deterministic', 'D3 must be labeled deterministic');
}

// D3 / case 2: a single non-violation event (work_item.created etc.)
// must not count as a drift.
{
    const s = score({
        auditEvents: [
            { event_type: 'work_item.created' },
            { event_type: 'agent_run.started' },
            { event_type: 'agent_run.completed' },
        ],
    });
    assert.equal(s.d3.score, 25, 'D3: benign events must score 25');
}

// D3 / case 3: exactly one policy_violation -> 18.
{
    const s = score({
        auditEvents: [{ event_type: 'policy_violation' }],
    });
    assert.equal(s.d3.score, 18, 'D3: one policy_violation must score 18');
    assert.equal(s.d3.kind, 'deterministic');
}

// D3 / case 4: a single 'drift' event also counts as one minor drift.
{
    const s = score({
        auditEvents: [{ event_type: 'drift' }],
    });
    assert.equal(s.d3.score, 18, 'D3: one drift event must score 18');
}

// D3 / case 5: a single 'hook.blocked' event also counts as one minor drift.
{
    const s = score({
        auditEvents: [{ event_type: 'hook.blocked' }],
    });
    assert.equal(s.d3.score, 18, 'D3: one hook.blocked event must score 18');
}

// D3 / case 6: two drifts (mixed types) -> 10.
{
    const s = score({
        auditEvents: [
            { event_type: 'policy_violation' },
            { event_type: 'hook.blocked' },
        ],
    });
    assert.equal(s.d3.score, 10, 'D3: two drifts must score 10');
}

// D3 / case 7: three drifts -> 10 (not lower; the floor for "multiple
// drifts" is 10).
{
    const s = score({
        auditEvents: [
            { event_type: 'drift' },
            { event_type: 'drift' },
            { event_type: 'drift' },
        ],
    });
    assert.equal(s.d3.score, 10, 'D3: multiple drifts must score 10');
}

// D3 / case 8: HOOK_BYPASS_ATTEMPT -> 0, regardless of other drifts.
{
    const s = score({
        auditEvents: [
            { event_type: 'HOOK_BYPASS_ATTEMPT' },
        ],
    });
    assert.equal(s.d3.score, 0, 'D3: hook bypass must score 0');
}

// D3 / case 9: HOOK_BYPASS_ATTEMPT mixed with drifts -> still 0.
// The hard stop dominates; recorded drifts do not raise the score.
{
    const s = score({
        auditEvents: [
            { event_type: 'policy_violation' },
            { event_type: 'drift' },
            { event_type: 'HOOK_BYPASS_ATTEMPT' },
        ],
    });
    assert.equal(s.d3.score, 0, 'D3: hook bypass must override drifts');
}

// D3 / case 10: malformed events (null entries, missing event_type) are
// ignored, not thrown on.
{
    const s = score({
        auditEvents: [null, {}, { event_type: null }, { event_type: 'agent_run.started' }],
    });
    assert.equal(s.d3.score, 25, 'D3: malformed events must be ignored');
}

// ----------------------------------------------------------------------------
// D4 deterministic rules.
//   25 if no known failure pattern for this agent+taskClass
//   10 if pattern exists in failure_records
//    0 if pattern exists AND was provided in instructions
// ----------------------------------------------------------------------------

// D4 / case 1: no known failures and no prior context -> 25.
{
    const s = score({ contract: { knownFailures: [], priorFailureContext: [] } });
    assert.equal(s.d4.score, 25, 'D4: clean record must score 25');
    assert.equal(s.d4.kind, 'deterministic', 'D4 must be labeled deterministic');
}

// D4 / case 2: contract is null/empty -> still 25 (no known failures).
{
    const s = score({ contract: null });
    assert.equal(s.d4.score, 25, 'D4: null contract must score 25');
}
{
    const s = score({ contract: {} });
    assert.equal(s.d4.score, 25, 'D4: empty contract must score 25');
}

// D4 / case 3: known failure exists in failure_records but was NOT in
// instructions -> 10. The agent had a track record but wasn't warned.
{
    const s = score({
        contract: {
            knownFailures: [{ failure_id: 'FAIL-2026-01-15-001' }],
            priorFailureContext: [],
        },
    });
    assert.equal(s.d4.score, 10, 'D4: known failure not provided must score 10');
}

// D4 / case 4: multiple known failures, none provided -> still 10
// (10 is the floor for "pattern exists, not provided").
{
    const s = score({
        contract: {
            knownFailures: [
                { failure_id: 'FAIL-2026-01-15-001' },
                { failure_id: 'FAIL-2026-01-20-007' },
            ],
            priorFailureContext: [],
        },
    });
    assert.equal(s.d4.score, 10, 'D4: multiple known failures, none provided must score 10');
}

// D4 / case 5: known failure exists AND was provided in instructions -> 0.
// This is the failure-library contract: the agent was warned and the
// pattern still recurred.
{
    const s = score({
        contract: {
            knownFailures:        [{ failure_id: 'FAIL-2026-01-15-001' }],
            priorFailureContext:  [{ failureId: 'FAIL-2026-01-15-001', preventionCheck: 'assert webhook idempotency' }],
        },
    });
    assert.equal(s.d4.score, 0, 'D4: warned and still failed must score 0');
}

// D4 / case 6: priorFailureContext provided but no known failure in
// failure_records -> 25. The agent received warnings about hypothetical
// patterns but has no actual track record; nothing recurred.
{
    const s = score({
        contract: {
            knownFailures: [],
            priorFailureContext: [{ failureId: 'FAIL-2026-01-15-001', preventionCheck: 'x' }],
        },
    });
    assert.equal(s.d4.score, 25, 'D4: warnings without a track record must score 25');
}

// ----------------------------------------------------------------------------
// Score object shape: D1/D2 labeled 'candidate', D3/D4 labeled
// 'deterministic', runtime_provider stamped on the object.
// ----------------------------------------------------------------------------
{
    const s = score({});
    assert.equal(s.d1.kind, 'candidate',     'D1 must be labeled candidate');
    assert.equal(s.d2.kind, 'candidate',     'D2 must be labeled candidate');
    assert.equal(s.d3.kind, 'deterministic', 'D3 must be labeled deterministic');
    assert.equal(s.d4.kind, 'deterministic', 'D4 must be labeled deterministic');

    assert.equal(s.runtime_provider, RUNTIME, 'runtime_provider must be stamped on the score');
    assert.equal(s.agent_id,         AGENT_ID);
    assert.equal(s.task_class,       TASK_CLASS);
    assert.equal(s.total, s.d1.score + s.d2.score + s.d3.score + s.d4.score,
        'total must equal the sum of the four dimensions');
}

// ----------------------------------------------------------------------------
// Trust level thresholds: HIGH 90-100, STANDARD 75-89, RESTRICTED 60-74,
// PROBATION below 60. Exact boundary values are tested because tier
// transitions are downstream gates.
// ----------------------------------------------------------------------------
{
    assert.equal(computeTrustLevel(100), 'HIGH');
    assert.equal(computeTrustLevel(90),  'HIGH');
    assert.equal(computeTrustLevel(89),  'STANDARD');
    assert.equal(computeTrustLevel(75),  'STANDARD');
    assert.equal(computeTrustLevel(74),  'RESTRICTED');
    assert.equal(computeTrustLevel(60),  'RESTRICTED');
    assert.equal(computeTrustLevel(59),  'PROBATION');
    assert.equal(computeTrustLevel(0),   'PROBATION');
}

// ----------------------------------------------------------------------------
// Confidence band thresholds: LOW (<5), MEDIUM (5-19), HIGH (>=20).
// ----------------------------------------------------------------------------
{
    assert.equal(computeConfidenceBand(0),  'LOW');
    assert.equal(computeConfidenceBand(4),  'LOW');
    assert.equal(computeConfidenceBand(5),  'MEDIUM');
    assert.equal(computeConfidenceBand(19), 'MEDIUM');
    assert.equal(computeConfidenceBand(20), 'HIGH');
    assert.equal(computeConfidenceBand(99), 'HIGH');
}

process.stdout.write('scorer: all tests passed\n');
