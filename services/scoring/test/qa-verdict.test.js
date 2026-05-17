// services/scoring/test/qa-verdict.test.js
//
// Exercises services/scoring/src/qa-verdict.js. Pure function tests; no
// database. Runs as a plain script:
//   node test/qa-verdict.test.js
// A non zero exit indicates failure. Uses node:assert/strict to match the
// scorer and governance suites.
//
// Covers every verdict outcome the E0-11 spec declares:
//   1. pass             — real run, all criteria pass, no warnings
//   2. pass_with_notes  — simulated run (always downgraded), also covered
//                         separately for a real run that carries warnings
//   3. fail             — at least one criterion fails
//   4. blocked          — at least one criterion is blocked (dominates fail)
//
// Every produced verdict is re-validated against the schema using an
// independent AJV instance, so a regression in the producer cannot pass
// the test merely because the producer's own validator approved it.

import assert from 'node:assert/strict';
import fs     from 'node:fs';
import os     from 'node:os';
import path   from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
    produceQAVerdict,
    writeVerdictToFile,
} from '../src/qa-verdict.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.resolve(__dirname, '..', '..', '..');
const SCHEMA = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'schemas', 'v1', 'qa-verdict.schema.json'), 'utf8'),
);

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validate = ajv.compile(SCHEMA);

function assertValid(verdict, label) {
    const ok = validate(verdict);
    assert.equal(
        ok,
        true,
        `${label}: AJV validation failed: ${ajv.errorsText(validate.errors)}`,
    );
}

const TASK_ID = '01HW2YA6NXBZ4S0K3K9C5R8RQ7';

const WORK_ITEM = {
    taskId: TASK_ID,
    title:  'Test work item',
};

const CONTRACT = {
    acceptanceCriteria: [
        { id: 'AC-1', text: 'POST /widgets returns 201 with the new widget body' },
        { id: 'AC-2', text: 'Integration test added under tests/api/widgets/' },
        { id: 'AC-3', text: 'Error envelope documented in the README' },
    ],
};

// Real (non-simulated) artifacts: clean tests, no warnings, no notes.
// criterion_results report each criterion as pass with evidence.
const REAL_PASS_ARTIFACTS = {
    evidence: { runtimeId: 'live-runtime' },
    tests_run: { passed: 5, failed: 0 },
    handoff_note: 'all green',
    criterion_results: {
        'AC-1': { result: 'pass', evidence: 'POST /widgets verified by test suite' },
        'AC-2': { result: 'pass', evidence: 'tests/api/widgets/post.test.ts present' },
        'AC-3': { result: 'pass', evidence: 'README updated, section anchor exists' },
    },
};

// ----------------------------------------------------------------------------
// Case 1: pass
//   Real run, all criteria pass, no warnings.
// ----------------------------------------------------------------------------
{
    const v = produceQAVerdict(WORK_ITEM, REAL_PASS_ARTIFACTS, CONTRACT);
    assert.equal(v.verdict,    'pass',         'pass: verdict must be pass');
    assert.equal(v.qaDecision, 'pass',         'pass: qaDecision legacy alias');
    assert.equal(v.criteria.length, 3,         'pass: all criteria included');
    for (const c of v.criteria) {
        assert.equal(c.result, 'pass',         'pass: every criterion result is pass');
        assert.ok(typeof c.criterion_id === 'string'   && c.criterion_id.length > 0);
        assert.ok(typeof c.criterion_text === 'string' && c.criterion_text.length > 0);
        assert.ok(typeof c.evidence === 'string'       && c.evidence.length > 0);
    }
    assert.match(v.verdictId, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'pass: verdictId is ULID-shaped');
    assert.equal(v.taskId, TASK_ID, 'pass: taskId echoed from work item');
    assertValid(v, 'pass');
}

// ----------------------------------------------------------------------------
// Case 2a: pass_with_notes (real run with warnings)
// ----------------------------------------------------------------------------
{
    const artifacts = {
        ...REAL_PASS_ARTIFACTS,
        warnings: ['lint: unused import in src/widgets.ts'],
    };
    const v = produceQAVerdict(WORK_ITEM, artifacts, CONTRACT);
    assert.equal(v.verdict,    'pass_with_notes',
        'pass_with_notes (warnings): verdict must be pass_with_notes');
    assert.equal(v.qaDecision, 'pass_with_notes',
        'pass_with_notes (warnings): qaDecision legacy alias');
    for (const c of v.criteria) {
        assert.equal(c.result, 'pass', 'pass_with_notes: criteria still pass');
    }
    assertValid(v, 'pass_with_notes (warnings)');
}

// ----------------------------------------------------------------------------
// Case 2b: pass_with_notes (simulated run, must NEVER produce clean pass)
// ----------------------------------------------------------------------------
{
    const artifacts = {
        evidence: { runtimeId: 'simulated' },
        tests_run: { passed: 0, failed: 0 },
        handoff_note: '[PREVIEW] simulated runtime produced no real artifacts',
        criterion_results: {
            'AC-1': { result: 'pass', evidence: '[PREVIEW] simulated' },
            'AC-2': { result: 'pass', evidence: '[PREVIEW] simulated' },
            'AC-3': { result: 'pass', evidence: '[PREVIEW] simulated' },
        },
    };
    const v = produceQAVerdict(WORK_ITEM, artifacts, CONTRACT);
    assert.equal(v.verdict, 'pass_with_notes',
        'simulated run: must downgrade pass to pass_with_notes');
    // Downgrade is recorded as a finding so a reviewer can see the reason.
    const hasDowngradeFinding = v.findings.some(
        (f) => f.category === 'simulated_run',
    );
    assert.equal(hasDowngradeFinding, true,
        'simulated run: downgrade finding must be present');
    assertValid(v, 'pass_with_notes (simulated)');
}

// Sanity check: simulated.runtimeId flag and the artifacts.simulated boolean
// trigger the same downgrade path.
{
    const artifacts = {
        simulated: true,
        criterion_results: {
            'AC-1': { result: 'pass', evidence: 'sim' },
            'AC-2': { result: 'pass', evidence: 'sim' },
            'AC-3': { result: 'pass', evidence: 'sim' },
        },
    };
    const v = produceQAVerdict(WORK_ITEM, artifacts, CONTRACT);
    assert.equal(v.verdict, 'pass_with_notes',
        'simulated:true flag must also downgrade to pass_with_notes');
}

// ----------------------------------------------------------------------------
// Case 3: fail
//   One criterion fails. fail must beat pass_with_notes but not blocked.
// ----------------------------------------------------------------------------
{
    const artifacts = {
        evidence: { runtimeId: 'live-runtime' },
        tests_run: { passed: 4, failed: 1 },
        criterion_results: {
            'AC-1': { result: 'fail', evidence: 'POST /widgets returned 500 in test 7' },
            'AC-2': { result: 'pass', evidence: 'test present' },
            'AC-3': { result: 'pass', evidence: 'README updated' },
        },
    };
    const v = produceQAVerdict(WORK_ITEM, artifacts, CONTRACT);
    assert.equal(v.verdict, 'fail', 'fail: verdict must be fail');
    assert.equal(v.qaDecision, 'fail', 'fail: qaDecision legacy alias');

    const failing = v.criteria.filter((c) => c.result === 'fail');
    assert.equal(failing.length, 1, 'fail: exactly one failing criterion recorded');
    assert.equal(failing[0].criterion_id, 'AC-1');
    assertValid(v, 'fail');
}

// ----------------------------------------------------------------------------
// Case 4: blocked
//   At least one criterion is 'blocked'. Even if other criteria fail,
//   'blocked' is the top-level verdict because it is the hard stop.
// ----------------------------------------------------------------------------
{
    const artifacts = {
        evidence: { runtimeId: 'live-runtime' },
        criterion_results: {
            'AC-1': { result: 'fail',    evidence: 'POST /widgets returned 500' },
            'AC-2': { result: 'blocked', evidence: 'cannot run integration test — DB migration not applied' },
            'AC-3': { result: 'pass',    evidence: 'README updated' },
        },
    };
    const v = produceQAVerdict(WORK_ITEM, artifacts, CONTRACT);
    assert.equal(v.verdict, 'blocked',
        'blocked: blocked must beat fail');
    assert.equal(v.qaDecision, 'block_release',
        'blocked: qaDecision legacy alias maps to block_release');

    const blocked = v.criteria.filter((c) => c.result === 'blocked');
    assert.equal(blocked.length, 1, 'blocked: exactly one blocked criterion recorded');
    assertValid(v, 'blocked');
}

// ----------------------------------------------------------------------------
// File writer: confirm the verdict round-trips to disk and the on-disk
// file also validates against the schema. Uses a temp path so the test
// does not collide with the repo's demo-output.
// ----------------------------------------------------------------------------
{
    const v = produceQAVerdict(WORK_ITEM, REAL_PASS_ARTIFACTS, CONTRACT);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-verdict-test-'));
    const target = path.join(tmpDir, 'qa-verdict.json');
    const written = writeVerdictToFile(v, target);
    assert.equal(written, target, 'writeVerdictToFile returns the resolved path');
    const onDisk = JSON.parse(fs.readFileSync(target, 'utf8'));
    assertValid(onDisk, 'on-disk verdict');
    assert.equal(onDisk.verdictId, v.verdictId, 'on-disk verdictId matches');
    fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ----------------------------------------------------------------------------
// Argument validation: malformed inputs throw rather than silently
// producing a half-formed verdict.
// ----------------------------------------------------------------------------
{
    assert.throws(
        () => produceQAVerdict(null, REAL_PASS_ARTIFACTS, CONTRACT),
        /workItem is required/,
        'null workItem must throw',
    );
    assert.throws(
        () => produceQAVerdict({ taskId: 'not-a-ulid' }, REAL_PASS_ARTIFACTS, CONTRACT),
        /ULID-shaped/,
        'non-ULID taskId must throw',
    );
    assert.throws(
        () => produceQAVerdict(WORK_ITEM, REAL_PASS_ARTIFACTS, { acceptanceCriteria: [] }),
        /at least one acceptance criterion/,
        'empty acceptance criteria must throw',
    );
}

process.stdout.write('qa-verdict: all tests passed\n');
