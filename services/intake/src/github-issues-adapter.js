#!/usr/bin/env node
// ============================================================================
// services/intake/src/github-issues-adapter.js
// E1-04: GitHub Issues -> AWF work item adapter.
//
// Pulls open issues from a single GitHub repo, filters out pull requests
// (which the issues endpoint also returns), and normalizes each issue into
// the AWF work-item shape the governance queue expects. Pagination is
// handled by Octokit.paginate; the caller gets a single flat array.
//
// Octokit is loaded lazily so the adapter can be unit-tested with an
// injected mock and no network. Pass `{ octokit }` in the options to
// override the real client.
//
// CLI:
//   awf intake github --repo owner/repo --token $GITHUB_TOKEN
//   node services/intake/src/github-issues-adapter.js \
//        --repo owner/repo --token $GITHUB_TOKEN [--milestone N] [--label foo]
// ============================================================================

export class GitHubIssuesAdapter {
    constructor(token, owner, repo, options = {}) {
        if (!owner || !repo) {
            throw new Error('GitHubIssuesAdapter requires owner and repo');
        }
        this.token = token;
        this.owner = owner;
        this.repo  = repo;
        // Injected client wins; otherwise we lazy-load @octokit/rest in _client().
        this.octokit = options.octokit ?? null;
    }

    async _client() {
        if (this.octokit) return this.octokit;
        const { Octokit } = await import('@octokit/rest');
        this.octokit = new Octokit({ auth: this.token });
        return this.octokit;
    }

    // Fetches open issues from the repo and returns an array of normalized
    // work items. Pull requests are filtered out (the issues endpoint
    // includes PRs with a `pull_request` field). Pagination is delegated
    // to Octokit.paginate, so the caller receives every page concatenated.
    async fetchOpenIssues(options = {}) {
        const octokit = await this._client();
        const params = {
            owner: this.owner,
            repo:  this.repo,
            state: 'open',
            per_page: options.per_page ?? 100,
        };
        if (options.milestone !== undefined) params.milestone = options.milestone;
        if (options.labels    !== undefined) params.labels    = options.labels;

        const raw = await octokit.paginate(octokit.rest.issues.listForRepo, params);
        return raw
            .filter((issue) => !issue.pull_request)
            .map((issue) => this.normalizeIssue(issue));
    }

    normalizeIssue(issue) {
        const labels = Array.isArray(issue.labels)
            ? issue.labels.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean)
            : [];
        return {
            external_ref:    `GH-${issue.number}`,
            external_source: 'github',
            title:           issue.title,
            description:     issue.body,
            labels,
            priority:        inferPriority(issue),
            acceptance_criteria: extractAcceptanceCriteria(issue.body),
            external_url:    issue.html_url,
        };
    }
}

// Map a GitHub issue's labels to an AWF priority score. We check the bands
// in descending severity so a P0/P1 wins over a P2 if both are present.
// Anything unrecognized falls back to 50 (between P2 and P3).
export function inferPriority(issue) {
    const names = Array.isArray(issue?.labels)
        ? issue.labels
              .map((l) => (typeof l === 'string' ? l : l?.name))
              .filter(Boolean)
              .map((n) => n.toLowerCase())
        : [];

    const has = (...keys) => names.some((n) => keys.includes(n));

    if (has('p0', 'critical', 'urgent')) return 100;
    if (has('p1', 'high'))               return 80;
    if (has('p2', 'medium'))             return 60;
    if (has('p3', 'low'))                return 40;
    return 50;
}

// Pull GitHub-flavored task list items out of an issue body. Matches both
// `- [ ]` and `- [x]` (case-insensitive) at the start of a line, with
// optional leading whitespace, and returns the trimmed text after the box.
export function extractAcceptanceCriteria(body) {
    if (typeof body !== 'string' || body.length === 0) return [];
    const re = /^[ \t]*-[ \t]+\[[ xX]\][ \t]+(.+?)[ \t]*$/gm;
    const out = [];
    let m;
    while ((m = re.exec(body)) !== null) {
        out.push(m[1]);
    }
    return out;
}

// ---------- CLI -------------------------------------------------------------

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                args[key] = true;
            } else {
                args[key] = next;
                i++;
            }
        }
    }
    return args;
}

async function main() {
    const args  = parseArgs(process.argv.slice(2));
    const repo  = args.repo;
    const token = args.token ?? process.env.GITHUB_TOKEN;

    if (!repo || !repo.includes('/')) {
        process.stderr.write('usage: --repo owner/repo --token $GITHUB_TOKEN [--milestone N] [--label foo]\n');
        process.exit(2);
    }
    if (!token) {
        process.stderr.write('missing --token or GITHUB_TOKEN env var\n');
        process.exit(2);
    }

    const [owner, repoName] = repo.split('/', 2);
    const adapter = new GitHubIssuesAdapter(token, owner, repoName);

    const opts = {};
    if (args.milestone) opts.milestone = args.milestone;
    if (args.label)     opts.labels    = args.label;

    const items = await adapter.fetchOpenIssues(opts);
    process.stdout.write(JSON.stringify(items, null, 2) + '\n');
}

// Only run the CLI when invoked directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        process.stderr.write(`github-issues-adapter failed: ${err.message}\n`);
        process.exit(1);
    });
}
