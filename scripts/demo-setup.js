#!/usr/bin/env node
// ============================================================================
// scripts/demo-setup.js
//
// One-shot setup for the Sprint 0 public demo. Reads DATABASE_URL from
// .env at the repo root (or the shell), then applies migrations 001..008
// against that database in order. Prints success/failure for each
// migration. Idempotent: every migration file is written to be safe to
// re-run against an already-applied database.
//
// Run:  npm run demo:setup
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function loadEnv() {
    const envPath = path.join(repoRoot, '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
    }
}

const MIGRATIONS = [
    '001_core_schema.sql',
    '002_audit_schema.sql',
    '003_audit_chain.sql',
    '004_work_item_classification.sql',
    '005_work_queue_claim.sql',
    '006_approval_gate.sql',
    '007_agent_assignment.sql',
    '008_audit_append_only.sql',
];

async function main() {
    loadEnv();
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error(
            'DATABASE_URL is not set. Copy .env.example to .env and edit it, then re-run.',
        );
        process.exit(1);
    }

    const migrationsDir = path.join(repoRoot, 'database', 'migrations');
    const client = new pg.Client({ connectionString: url });
    await client.connect();

    let failed = false;
    for (const name of MIGRATIONS) {
        const filePath = path.join(migrationsDir, name);
        if (!fs.existsSync(filePath)) {
            console.error(`  FAIL ${name}: file not found at ${filePath}`);
            failed = true;
            break;
        }
        const sql = fs.readFileSync(filePath, 'utf8');
        try {
            await client.query(sql);
            console.log(`  ok   ${name}`);
        } catch (err) {
            console.error(`  FAIL ${name}: ${err.message}`);
            failed = true;
            break;
        }
    }

    await client.end();

    if (failed) {
        process.exit(1);
    }
    console.log('');
    console.log('Setup complete. Run: npm run demo');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
