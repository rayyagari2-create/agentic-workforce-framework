// ============================================================================
// services/execution/src/git-workspace-manager.js
//
// GitWorkspaceManager
//
// Owns the lifecycle of per-work-item git workspaces. Each work item gets a
// dedicated branch and a dedicated worktree on disk so multiple agents can
// edit the repo at once without stepping on each other.
//
// Surface:
//   createWorkspace(workItem)        -> { branchName, worktreePath, baseCommit }
//   getChangedFiles(workItem)        -> string[]
//   createPRMetadata(workItem, art)  -> { branch, base, title, body, files_changed }
//   cleanupWorkspace(workItem, why)  -> void   (acts only on 'cancelled'/'failed')
//   worktreePath(workItem)           -> string
//   branchName(workItem)             -> string
//
// Conventions:
//   - Branch:   awf/<external_ref>-<slug-of-title up to 40 chars>
//   - Worktree: <repoRoot>/.awf/worktrees/<external_ref>
//   - baseCommit: the parent repo's HEAD at the moment of createWorkspace
//
// Concurrency: enforces a configurable cap (default 10) by counting registered
// AWF worktrees via `git worktree list --porcelain`. The cap is a guardrail
// against runaway parallelism, not a queue.
// ============================================================================

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';

const DEFAULT_MAX_CONCURRENT = 10;
const SLUG_MAX = 40;

function slugify(title) {
    const s = String(title ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_MAX)
        .replace(/-+$/g, '');
    return s || 'untitled';
}

function refKey(workItem) {
    if (!workItem || workItem.external_ref == null) {
        throw new Error('workItem.external_ref is required');
    }
    return String(workItem.external_ref);
}

export class GitWorkspaceManager {
    constructor({ repoRoot, maxConcurrentWorktrees = DEFAULT_MAX_CONCURRENT } = {}) {
        if (!repoRoot) throw new Error('repoRoot is required');
        this.repoRoot = path.resolve(repoRoot);
        this.maxConcurrentWorktrees = maxConcurrentWorktrees;
        this.git = simpleGit(this.repoRoot);
        // baseCommit per work item is held in-process. Workspaces created in
        // a prior process are still safe to clean up; getChangedFiles requires
        // the same process that called createWorkspace.
        this._baseCommits = new Map();
    }

    branchName(workItem) {
        return `awf/${refKey(workItem)}-${slugify(workItem.title)}`;
    }

    worktreePath(workItem) {
        return path.join(this.repoRoot, '.awf', 'worktrees', refKey(workItem));
    }

    async _listAwfWorktrees() {
        const out = await this.git.raw(['worktree', 'list', '--porcelain']);
        const awfMarker = `${path.sep}.awf${path.sep}worktrees${path.sep}`;
        const results = [];
        for (const line of out.split('\n')) {
            if (line.startsWith('worktree ')) {
                const p = line.slice('worktree '.length);
                if (p.includes(awfMarker)) results.push(p);
            }
        }
        return results;
    }

    async createWorkspace(workItem) {
        const ref = refKey(workItem);
        const branch = this.branchName(workItem);
        const wtPath = this.worktreePath(workItem);

        const existing = await this._listAwfWorktrees();
        if (existing.length >= this.maxConcurrentWorktrees) {
            throw new Error(
                `git workspace cap reached: ${existing.length}/${this.maxConcurrentWorktrees} active worktrees`
            );
        }

        const branches = await this.git.branchLocal();
        if (branches.all.includes(branch)) {
            throw new Error(`branch already exists: ${branch}`);
        }

        const baseCommit = (await this.git.revparse(['HEAD'])).trim();

        await fs.mkdir(path.dirname(wtPath), { recursive: true });
        await this.git.raw(['worktree', 'add', '-b', branch, wtPath, baseCommit]);

        this._baseCommits.set(ref, baseCommit);
        return { branchName: branch, worktreePath: wtPath, baseCommit };
    }

    async getChangedFiles(workItem) {
        const ref = refKey(workItem);
        const baseCommit = this._baseCommits.get(ref);
        if (!baseCommit) {
            throw new Error(
                `no recorded baseCommit for ${ref}; was createWorkspace called in this process?`
            );
        }
        const wtPath = this.worktreePath(workItem);
        const wtGit = simpleGit(wtPath);

        // Captures committed and uncommitted changes vs baseCommit.
        const diffOut = await wtGit.raw(['diff', '--name-only', baseCommit]);
        // Untracked files aren't included by `git diff`.
        const untrackedOut = await wtGit.raw(['ls-files', '--others', '--exclude-standard']);

        const files = new Set();
        for (const block of [diffOut, untrackedOut]) {
            for (const raw of block.split('\n')) {
                const f = raw.trim();
                if (f) files.add(f);
            }
        }
        return Array.from(files).sort();
    }

    async createPRMetadata(workItem, artifacts = {}) {
        const files = await this.getChangedFiles(workItem);
        const title = workItem.title || `AWF work item ${refKey(workItem)}`;
        const body =
            artifacts.handoff_note ||
            artifacts.body ||
            workItem.description ||
            '';
        return {
            branch: this.branchName(workItem),
            base: 'main',
            title,
            body,
            files_changed: files,
        };
    }

    async cleanupWorkspace(workItem, reason) {
        if (reason !== 'cancelled' && reason !== 'failed') return;
        const ref = refKey(workItem);
        const wtPath = this.worktreePath(workItem);
        const branch = this.branchName(workItem);

        try {
            await this.git.raw(['worktree', 'remove', '--force', wtPath]);
        } catch {
            // Worktree may already be gone; prune stale records and continue.
            try { await this.git.raw(['worktree', 'prune']); } catch { /* noop */ }
        }

        try {
            await this.git.raw(['branch', '-D', branch]);
        } catch {
            // Branch may not exist; cleanup is idempotent.
        }

        this._baseCommits.delete(ref);
    }
}

export default GitWorkspaceManager;
