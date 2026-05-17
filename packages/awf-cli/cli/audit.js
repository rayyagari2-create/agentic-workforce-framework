import path from 'node:path';
import { fileURLToPath } from 'node:url';

// awf-cli intentionally does not depend on pg directly. It loads the
// verify entrypoint from services/audit-service via a monorepo relative
// path so the audit service owns its database access and its dependency
// surface stays isolated.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

async function loadVerify() {
    const modPath = path.join(repoRoot, 'services', 'audit-service', 'src', 'verify.js');
    return import(modPath);
}

async function loadDb() {
    const modPath = path.join(repoRoot, 'services', 'audit-service', 'src', 'db.js');
    return import(modPath);
}

export async function audit(action) {
    if (action !== 'verify') {
        process.stderr.write(`unknown subcommand: audit ${action ?? ''}\nusage: awf audit verify\n`);
        process.exit(2);
    }
    const { runVerify } = await loadVerify();
    const { closePool } = await loadDb();
    try {
        const result = await runVerify();
        process.exitCode = result.ok ? 0 : 1;
    } finally {
        await closePool().catch(() => {});
    }
}
