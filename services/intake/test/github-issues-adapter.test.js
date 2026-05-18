// services/intake/test/github-issues-adapter.test.js
//
// Exercises GitHubIssuesAdapter end-to-end with a mock Octokit so no
// network calls are made. Run as: `node test/github-issues-adapter.test.js`.
// Non-zero exit = failure.
//
// Tests:
//   1. normalizeIssue correctly maps all fields
//   2. inferPriority maps all label combinations correctly
//   3. extractAcceptanceCriteria extracts checkboxes from a markdown body
//   4. Pull requests are filtered out by fetchOpenIssues

import assert from 'node:assert/strict';
import {
    GitHubIssuesAdapter,
    inferPriority,
    extractAcceptanceCriteria,
} from '../src/github-issues-adapter.js';

// Minimal stand-in for Octokit. The adapter only touches
// `octokit.paginate(method, params)` and `octokit.rest.issues.listForRepo`,
// so we model just those. paginate returns the data array directly to
// match the real Octokit pagination contract.
function makeMockOctokit(issues) {
    const calls = [];
    const listForRepo = async (params) => {
        calls.push({ method: 'listForRepo', params });
        return { data: issues };
    };
    return {
        calls,
        paginate: async (method, params) => {
            const r = await method(params);
            return r.data;
        },
        rest: { issues: { listForRepo } },
    };
}

// --- Test 1: normalizeIssue correctly maps all fields -----------------------
async function test_normalizeIssue_maps_all_fields() {
    const adapter = new GitHubIssuesAdapter('fake-token', 'octo', 'demo', {
        octokit: makeMockOctokit([]),
    });

    const issue = {
        number: 42,
        title:  'Add login button to homepage',
        body:   'We need a login button.\n\n- [ ] Button renders\n- [x] Button is wired up\n',
        labels: [{ name: 'P1' }, { name: 'frontend' }],
        html_url: 'https://github.com/octo/demo/issues/42',
    };

    const wi = adapter.normalizeIssue(issue);

    assert.equal(wi.external_ref,    'GH-42');
    assert.equal(wi.external_source, 'github');
    assert.equal(wi.title,           'Add login button to homepage');
    assert.equal(wi.description,     issue.body);
    assert.deepEqual(wi.labels,      ['P1', 'frontend']);
    assert.equal(wi.priority,        80, 'P1 should map to 80');
    assert.deepEqual(wi.acceptance_criteria, ['Button renders', 'Button is wired up']);
    assert.equal(wi.external_url,    'https://github.com/octo/demo/issues/42');

    // Bare-string labels (rare but legal in some GitHub tooling) also work.
    const bare = adapter.normalizeIssue({
        number: 7,
        title:  'bare label test',
        body:   '',
        labels: ['bug', 'P3'],
        html_url: 'https://github.com/octo/demo/issues/7',
    });
    assert.deepEqual(bare.labels, ['bug', 'P3']);
    assert.equal(bare.priority,   40, 'P3 should map to 40');
    assert.deepEqual(bare.acceptance_criteria, []);

    console.log('PASS  test_normalizeIssue_maps_all_fields');
}

// --- Test 2: inferPriority maps all label combinations ----------------------
async function test_inferPriority_label_combinations() {
    const mk = (...names) => ({ labels: names.map((n) => ({ name: n })) });

    // Explicit P-tier labels.
    assert.equal(inferPriority(mk('P0')), 100);
    assert.equal(inferPriority(mk('P1')), 80);
    assert.equal(inferPriority(mk('P2')), 60);
    assert.equal(inferPriority(mk('P3')), 40);

    // Synonyms for each tier.
    assert.equal(inferPriority(mk('critical')), 100);
    assert.equal(inferPriority(mk('urgent')),   100);
    assert.equal(inferPriority(mk('high')),     80);
    assert.equal(inferPriority(mk('medium')),   60);
    assert.equal(inferPriority(mk('low')),      40);

    // Case insensitive.
    assert.equal(inferPriority(mk('p0')),       100);
    assert.equal(inferPriority(mk('High')),     80);
    assert.equal(inferPriority(mk('CRITICAL')), 100);

    // Highest-severity label wins when several are present.
    assert.equal(inferPriority(mk('P3', 'P0')),       100);
    assert.equal(inferPriority(mk('low', 'high')),    80);
    assert.equal(inferPriority(mk('frontend', 'P2')), 60);

    // No matching label -> default of 50.
    assert.equal(inferPriority(mk('bug', 'frontend')), 50);
    assert.equal(inferPriority(mk()),                  50);
    assert.equal(inferPriority({}),                    50);
    assert.equal(inferPriority({ labels: null }),      50);

    // Bare-string labels also work.
    assert.equal(inferPriority({ labels: ['P0'] }),     100);
    assert.equal(inferPriority({ labels: ['medium'] }), 60);

    console.log('PASS  test_inferPriority_label_combinations');
}

// --- Test 3: extractAcceptanceCriteria pulls checkbox lines -----------------
async function test_extractAcceptanceCriteria_from_body() {
    const body = [
        '## Summary',
        'Add a login button to the homepage.',
        '',
        '## Acceptance criteria',
        '- [ ] Button renders in the header',
        '- [x] Button is wired up to /login',
        '   - [ ] Indented checkbox is included',
        '- [X] Uppercase X also counts',
        '',
        '## Notes',
        '- not a checkbox, just a bullet',
        '* [ ] wrong bullet style is skipped',
        '',
    ].join('\n');

    const out = extractAcceptanceCriteria(body);

    assert.deepEqual(out, [
        'Button renders in the header',
        'Button is wired up to /login',
        'Indented checkbox is included',
        'Uppercase X also counts',
    ]);

    // Empty / non-string bodies are safe.
    assert.deepEqual(extractAcceptanceCriteria(''),        []);
    assert.deepEqual(extractAcceptanceCriteria(null),      []);
    assert.deepEqual(extractAcceptanceCriteria(undefined), []);

    // A body with no checkboxes returns an empty array.
    assert.deepEqual(
        extractAcceptanceCriteria('Just prose, nothing to check.\n\nAnother paragraph.'),
        [],
    );

    console.log('PASS  test_extractAcceptanceCriteria_from_body');
}

// --- Test 4: fetchOpenIssues filters out pull requests ----------------------
async function test_fetchOpenIssues_filters_pull_requests() {
    const mock = makeMockOctokit([
        {
            number: 1,
            title:  'Real issue one',
            body:   'plain',
            labels: [{ name: 'P2' }],
            html_url: 'https://github.com/octo/demo/issues/1',
        },
        {
            number: 2,
            title:  'A pull request masquerading as an issue',
            body:   'PR body',
            labels: [],
            html_url: 'https://github.com/octo/demo/pull/2',
            // GitHub's REST API marks PRs by including this field on the issue.
            pull_request: { url: 'https://api.github.com/repos/octo/demo/pulls/2' },
        },
        {
            number: 3,
            title:  'Real issue two',
            body:   '- [ ] do the thing',
            labels: [{ name: 'P0' }],
            html_url: 'https://github.com/octo/demo/issues/3',
        },
    ]);

    const adapter = new GitHubIssuesAdapter('fake-token', 'octo', 'demo', { octokit: mock });

    const items = await adapter.fetchOpenIssues({ per_page: 50, labels: 'bug' });

    assert.equal(items.length, 2, 'pull requests must be filtered out');
    assert.deepEqual(items.map((i) => i.external_ref), ['GH-1', 'GH-3']);
    assert.equal(items[0].priority, 60, 'P2 -> 60');
    assert.equal(items[1].priority, 100, 'P0 -> 100');
    assert.deepEqual(items[1].acceptance_criteria, ['do the thing']);

    // The adapter forwards filter options and asks for the open state.
    assert.equal(mock.calls.length, 1);
    assert.deepEqual(mock.calls[0].params, {
        owner: 'octo',
        repo:  'demo',
        state: 'open',
        per_page: 50,
        labels:   'bug',
    });

    console.log('PASS  test_fetchOpenIssues_filters_pull_requests');
}

let failed = false;
for (const t of [
    test_normalizeIssue_maps_all_fields,
    test_inferPriority_label_combinations,
    test_extractAcceptanceCriteria_from_body,
    test_fetchOpenIssues_filters_pull_requests,
]) {
    try {
        await t();
    } catch (err) {
        failed = true;
        console.error(`FAIL  ${t.name}\n${err && err.stack ? err.stack : err}`);
    }
}

if (failed) {
    process.exit(1);
}
process.stdout.write('\ngithub-issues-adapter.test.js: all 4 tests passed\n');
