// services/execution/test/git-workspace-manager.test.js
//
// Exercises GitWorkspaceManager against a throwaway repo under
// .awf/test-repo/ at the framework root. No state leaks into the main repo
// because .awf/ is gitignored and torn down between tests.
//
// Run as: `node test/git-workspace-manager.test.js`. Non-zero exit = failure.

import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simpleGit } from 'simple-git';

import { GitWorkspaceManager } from '../src/git-workspace-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// services/execution/test/.. /.. /.. = framework root
const FRAMEWORK_ROOT = path.resolve(__dirname, '..', '..', '..');
const TEST_REPO = path.join(FRAMEWORK_ROOT, '.awf', 'test-repo');

async function setupTestRepo() {
    await fs.rm(TEST_REPO, { recursive: true, force: true });
    await fs.mkdir(TEST_REPO, { recursive: true });

    const g = simpleGit(TEST_REPO);
    await g.init();
    await g.addConfig('user.email', 'test@awf.local', false, 'local');
    await g.addConfig('user.name', 'AWF Test', false, 'local');
    await g.addConfig('commit.gpgsign', 'false', false, 'local');
    // Ensure a deterministic default branch name on systems where init.defaultBranch varies.
    await g.raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);

    await fs.writeFile(path.join(TEST_REPO, 'README.md'), '# test\n');
    await g.add('README.md');
    await g.commit('seed');
    return TEST_REPO;
}

async function teardownTestRepo() {
    // Remove any registered worktrees first to avoid leaving git records dangling.
    try {
        const g = simpleGit(TEST_REPO);
        const out = await g.raw(['worktree', 'list', '--porcelain']);
        for (const line of out.split('\n')) {
            if (line.startsWith('worktree ')) {
                const p = line.slice('worktree '.length);
                if (p && p !== TEST_REPO) {
                    try { await g.raw(['worktree', 'remove', '--force', p]); } catch { /* noop */ }
                }
            }
        }
    } catch { /* repo may not exist */ }
    await fs.rm(TEST_REPO, { recursive: true, force: true });
}

function gitWorktreeList(repo) {
    return execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
}

function gitBranchList(repo) {
    // `git branch --list` prefixes each line with two characters (`* ` or `  `);
    // strip them so callers can do direct .includes() / array checks on branch names.
    const out = execSync('git branch --list', { cwd: repo, encoding: 'utf8' });
    return out
        .split('\n')
        .map((l) => l.replace(/^[*+\s]+/, '').trim())
        .filter(Boolean)
        .join('\n');
}

// --- Test 1: createWorkspace creates a real branch and a real worktree ---
async function test_createWorkspace_real() {
    const repo = await setupTestRepo();
    try {
        const mgr = new GitWorkspaceManager({ repoRoot: repo });
        const wi = { external_ref: 'ISSUE-1', title: 'Add Login Button to Homepage!!!' };

        const r = await mgr.createWorkspace(wi);

        assert.equal(r.branchName, 'awf/ISSUE-1-add-login-button-to-homepage');
        assert.equal(r.worktreePath, path.join(repo, '.awf', 'worktrees', 'ISSUE-1'));
        assert.match(r.baseCommit, /^[0-9a-f]{40}$/, 'baseCommit must be a full SHA');

        const wtList = gitWorktreeList(repo);
        assert.ok(
            wtList.includes(r.worktreePath),
            `git worktree list must include the new worktree path. got:\n${wtList}`
        );
        assert.ok(
            wtList.includes(`branch refs/heads/${r.branchName}`),
            `git worktree list must reference the new branch. got:\n${wtList}`
        );

        // The worktree directory really exists and is checked out at our branch.
        const wtGit = simpleGit(r.worktreePath);
        const cur = (await wtGit.revparse(['--abbrev-ref', 'HEAD'])).trim();
        assert.equal(cur, r.branchName);

        // Helpers are consistent with the returned values.
        assert.equal(mgr.branchName(wi), r.branchName);
        assert.equal(mgr.worktreePath(wi), r.worktreePath);

        console.log('PASS  test_createWorkspace_real');
    } finally {
        await teardownTestRepo();
    }
}

// --- Test 2: changes in one worktree do not appear in another ---
async function test_no_contamination() {
    const repo = await setupTestRepo();
    try {
        const mgr = new GitWorkspaceManager({ repoRoot: repo });
        const a = await mgr.createWorkspace({ external_ref: 'A', title: 'feat a' });
        const b = await mgr.createWorkspace({ external_ref: 'B', title: 'feat b' });

        // Commit a.txt in worktree A.
        await fs.writeFile(path.join(a.worktreePath, 'a.txt'), 'from A');
        const aGit = simpleGit(a.worktreePath);
        await aGit.add('a.txt');
        await aGit.commit('add a.txt');

        // Commit b.txt in worktree B.
        await fs.writeFile(path.join(b.worktreePath, 'b.txt'), 'from B');
        const bGit = simpleGit(b.worktreePath);
        await bGit.add('b.txt');
        await bGit.commit('add b.txt');

        // Files must not bleed across worktrees.
        await assert.rejects(
            fs.access(path.join(b.worktreePath, 'a.txt')),
            'a.txt must NOT exist in worktree B'
        );
        await assert.rejects(
            fs.access(path.join(a.worktreePath, 'b.txt')),
            'b.txt must NOT exist in worktree A'
        );

        // And the manager reports independent change sets.
        const aChanged = await mgr.getChangedFiles({ external_ref: 'A' });
        const bChanged = await mgr.getChangedFiles({ external_ref: 'B' });
        assert.deepEqual(aChanged, ['a.txt']);
        assert.deepEqual(bChanged, ['b.txt']);

        console.log('PASS  test_no_contamination');
    } finally {
        await teardownTestRepo();
    }
}

// --- Test 3: cleanupWorkspace removes worktree and branch on failure ---
async function test_cleanup_on_failure() {
    const repo = await setupTestRepo();
    try {
        const mgr = new GitWorkspaceManager({ repoRoot: repo });
        const wi = { external_ref: 'CLEANUP-1', title: 'will fail' };

        const r = await mgr.createWorkspace(wi);

        // Sanity: it exists before cleanup.
        assert.ok(gitWorktreeList(repo).includes(r.worktreePath));
        assert.ok(gitBranchList(repo).split('\n').includes(r.branchName));

        await mgr.cleanupWorkspace(wi, 'failed');

        const wtAfter = gitWorktreeList(repo);
        assert.ok(!wtAfter.includes(r.worktreePath), `worktree must be gone. got:\n${wtAfter}`);

        const brAfter = gitBranchList(repo).split('\n');
        assert.ok(!brAfter.includes(r.branchName), `branch must be deleted. got: ${brAfter.join(',')}`);

        await assert.rejects(fs.access(r.worktreePath), 'worktree dir must be removed');

        // Idempotent: a second cleanup must not throw.
        await mgr.cleanupWorkspace(wi, 'failed');

        // 'cancelled' is also a destructive reason; non-destructive reasons are a no-op.
        const wi2 = { external_ref: 'NOOP-1', title: 'noop' };
        const r2 = await mgr.createWorkspace(wi2);
        await mgr.cleanupWorkspace(wi2, 'succeeded'); // should NOT delete
        assert.ok(gitWorktreeList(repo).includes(r2.worktreePath), 'non-destructive reason must keep worktree');
        await mgr.cleanupWorkspace(wi2, 'cancelled'); // now delete
        assert.ok(!gitWorktreeList(repo).includes(r2.worktreePath), 'cancelled must delete');

        console.log('PASS  test_cleanup_on_failure');
    } finally {
        await teardownTestRepo();
    }
}

// --- Test 4: 3 concurrent worktrees, all independent ---
async function test_three_concurrent() {
    const repo = await setupTestRepo();
    try {
        const mgr = new GitWorkspaceManager({ repoRoot: repo });
        const items = [
            { external_ref: 'C1', title: 'task one' },
            { external_ref: 'C2', title: 'task two' },
            { external_ref: 'C3', title: 'task three' },
        ];

        const created = await Promise.all(items.map((wi) => mgr.createWorkspace(wi)));

        assert.equal(created.length, 3);
        assert.equal(new Set(created.map((c) => c.worktreePath)).size, 3, 'paths must be distinct');
        assert.equal(new Set(created.map((c) => c.branchName)).size, 3, 'branches must be distinct');

        // git agrees that all three are live.
        const wtList = gitWorktreeList(repo);
        for (const c of created) {
            assert.ok(wtList.includes(c.worktreePath), `worktree must be registered: ${c.worktreePath}`);
            assert.ok(wtList.includes(`branch refs/heads/${c.branchName}`), `branch ref must appear: ${c.branchName}`);
        }

        // Write a unique file in each worktree concurrently.
        await Promise.all(items.map(async (_wi, i) => {
            const wt = created[i].worktreePath;
            const fname = `c${i + 1}.txt`;
            await fs.writeFile(path.join(wt, fname), `from C${i + 1}`);
            const g = simpleGit(wt);
            await g.add(fname);
            await g.commit(`add ${fname}`);
        }));

        // Each worktree contains only its own file.
        for (let i = 0; i < items.length; i++) {
            for (let j = 0; j < items.length; j++) {
                const fname = `c${j + 1}.txt`;
                const p = path.join(created[i].worktreePath, fname);
                if (i === j) {
                    await fs.access(p); // must exist
                } else {
                    await assert.rejects(fs.access(p), `${fname} must NOT exist in worktree ${i + 1}`);
                }
            }
        }

        const changed = await Promise.all(items.map((wi) => mgr.getChangedFiles(wi)));
        assert.deepEqual(changed[0], ['c1.txt']);
        assert.deepEqual(changed[1], ['c2.txt']);
        assert.deepEqual(changed[2], ['c3.txt']);

        // createPRMetadata is consistent with the worktree state.
        const meta = await mgr.createPRMetadata(items[0], { handoff_note: 'done' });
        assert.equal(meta.branch, created[0].branchName);
        assert.equal(meta.base, 'main');
        assert.equal(meta.title, items[0].title);
        assert.equal(meta.body, 'done');
        assert.deepEqual(meta.files_changed, ['c1.txt']);

        console.log('PASS  test_three_concurrent');
    } finally {
        await teardownTestRepo();
    }
}

let failed = false;
for (const t of [
    test_createWorkspace_real,
    test_no_contamination,
    test_cleanup_on_failure,
    test_three_concurrent,
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
process.stdout.write('\ngit-workspace-manager.test.js: all 4 tests passed\n');
