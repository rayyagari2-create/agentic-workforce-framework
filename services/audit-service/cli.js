#!/usr/bin/env node
// services/audit-service/cli.js
//
// Local entrypoint for the audit service operator commands. Today it
// exposes `verify`, which is also wired into the awf top level CLI as
// `awf audit verify`.

import { runVerify } from './src/verify.js';
import { closePool } from './src/db.js';

const cmd = process.argv[2];

async function main() {
    if (cmd === 'verify') {
        const result = await runVerify();
        process.exit(result.ok ? 0 : 1);
    }
    process.stderr.write(`unknown command: ${cmd ?? ''}\nusage: audit-service verify\n`);
    process.exit(2);
}

main()
    .catch((err) => {
        process.stderr.write(`audit-service cli failed: ${err.message}\n`);
        process.exit(1);
    })
    .finally(() => closePool().catch(() => {}));
