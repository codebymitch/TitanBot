#!/usr/bin/env node
/**
 * Manually migrate legacy database keys to canonical form.
 *
 * NOTE: This also runs automatically on bot startup (see runStartupKeyMigration
 * in src/utils/postgresDatabase.js), which is the recommended path for hosts
 * like Railway where one-off scripts are inconvenient. Use this script only for
 * a dry-run preview or to force a re-run.
 *
 * Usage:
 *   node scripts/migrate-keys.js [--dry-run] [--force]
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSslConfig } from '../src/config/database/postgres.js';
import { runKeyMigration } from '../src/utils/database/keyMigration.js';
import { logger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

async function run() {
    const pool = new Pool({
        connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        ssl: resolveSslConfig(),
    });

    try {
        const summary = await runKeyMigration({ pool, dryRun, force, logger });
        if (summary?.alreadyDone) {
            logger.info('Key migration already applied. Use --force to re-run.');
        }
    } finally {
        await pool.end();
    }
}

run().catch((error) => {
    logger.error('Key migration failed:', error);
    process.exit(1);
});
