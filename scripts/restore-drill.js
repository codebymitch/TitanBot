import { spawnSync } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { logger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = pg;

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=');
    if (typeof inlineValue !== 'undefined') {
      args[rawKey] = inlineValue;
      continue;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith('--')) {
      args[rawKey] = true;
      continue;
    }

    args[rawKey] = nextToken;
    index += 1;
  }

  return args;
}

function ensureCommand(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error(`${command} is required but was not found in PATH.`);
  }
}

function createTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || 'Unknown error'}`);
  }

  return result.stdout;
}

async function pruneBackups(backupDir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }

  const entries = await readdir(backupDir, { withFileTypes: true });
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.dump')) {
      continue;
    }

    const fullPath = path.join(backupDir, entry.name);
    const fileStats = await stat(fullPath);
    if (fileStats.mtimeMs < cutoff) {
      await unlink(fullPath);
    }
  }
}

function buildDatabaseUrlWithName(databaseUrl, databaseName) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const sourceDatabaseUrl = process.env.POSTGRES_URL;
  if (!sourceDatabaseUrl) {
    throw new Error('Missing required environment variable: POSTGRES_URL');
  }

  const keepDrillDatabase = args['keep-db'] === true || args['keep-db'] === 'true';
  const retentionDays = Number.parseInt(args['retention-days'] || process.env.BACKUP_RETENTION_DAYS || '14', 10);
  const backupDir = path.resolve(args['backup-dir'] || process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));

  ensureCommand('pg_dump');
  ensureCommand('pg_restore');

  await mkdir(backupDir, { recursive: true });

  const stamp = createTimestamp();
  const backupPath = path.join(backupDir, `restore-drill-${stamp}.dump`);
  const drillDatabaseName = `titanbot_restore_drill_${stamp}`;
  const maintenanceUrl = buildDatabaseUrlWithName(sourceDatabaseUrl, 'postgres');
  const drillDatabaseUrl = buildDatabaseUrlWithName(sourceDatabaseUrl, drillDatabaseName);

  const maintenancePool = new Pool({ connectionString: maintenanceUrl });

  logger.info('Starting restore drill', {
    event: 'restore_drill.start',
    drillDatabaseName
  });

  try {
    runCommand('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      backupPath,
      sourceDatabaseUrl
    ]);

    const createClient = await maintenancePool.connect();
    try {
      await createClient.query(`CREATE DATABASE "${drillDatabaseName}" TEMPLATE template0`);
    } finally {
      createClient.release();
    }

    runCommand('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      drillDatabaseUrl,
      backupPath
    ]);

    const verifyPool = new Pool({ connectionString: drillDatabaseUrl });
    try {
      const tableCount = await verifyPool.query(
        `SELECT COUNT(*)::int AS value FROM information_schema.tables WHERE table_schema = 'public'`
      );

      const migrationTableCount = await verifyPool.query(
        `SELECT COUNT(*)::int AS value FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations'`
      );

      if (tableCount.rows[0]?.value <= 0) {
        throw new Error('Restore drill verification failed: no public tables restored.');
      }

      if (migrationTableCount.rows[0]?.value <= 0) {
        throw new Error('Restore drill verification failed: schema_migrations table missing.');
      }
    } finally {
      await verifyPool.end();
    }

    logger.info('Restore drill completed successfully', {
      event: 'restore_drill.completed',
      drillDatabaseName,
      backupPath
    });
  } finally {
    if (!keepDrillDatabase) {
      const dropClient = await maintenancePool.connect();
      try {
        await dropClient.query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [drillDatabaseName]
        );
        await dropClient.query(`DROP DATABASE IF EXISTS "${drillDatabaseName}"`);
      } finally {
        dropClient.release();
      }
    }

    await maintenancePool.end();
    await pruneBackups(backupDir, retentionDays);
  }
}

run().catch((error) => {
  logger.error('Restore drill failed', {
    event: 'restore_drill.failed',
    error: error.message
  });
  process.exit(1);
});
