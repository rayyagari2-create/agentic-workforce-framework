// services/audit-service/src/env.js
//
// Minimal .env loader. Reads KEY=VALUE pairs from a .env file at the repo
// root and merges any keys not already present into process.env. We avoid
// pulling in dotenv as a dependency because the loader needs only two
// behaviors: parse lines and respect existing process.env values.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadEnv() {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
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
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

export function databaseUrl() {
    loadEnv();
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error(
            'DATABASE_URL is not set. Add it to .env at the repo root or export it in the shell.',
        );
    }
    return url;
}
