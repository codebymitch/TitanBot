import { spawnSync } from 'node:child_process';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { logger } from '../src/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

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

function assertEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
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
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

async function pruneBackups(backupDir, retentionDays) {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }

  const entries = await readdir(backupDir, { withFileTypes: true });
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.dump')) {
      continue;
    }

    const fullPath = path.join(backupDir, entry.name);
    const fileStats = await stat(fullPath);
    if (fileStats.mtimeMs < cutoff) {
      await unlink(fullPath);
      removed += 1;
    }
  }

  if (removed > 0) {
    logger.info(`Pruned ${removed} old backup file(s)`, {
      event: 'backup.prune.completed',
      removed,
      retentionDays
    });
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = assertEnv('POSTGRES_URL');
  const retentionDays = Number.parseInt(args['retention-days'] || process.env.BACKUP_RETENTION_DAYS || '14', 10);
  const backupDir = path.resolve(args['backup-dir'] || process.env.BACKUP_DIR || path.join(process.cwd(), 'backups'));

  ensureCommand('pg_dump');
  await mkdir(backupDir, { recursive: true });

  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(backupDir, `titanbot-backup-${createTimestamp()}.dump`);

  const dumpArgs = [
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    outputPath,
    databaseUrl
  ];

  logger.info('Starting PostgreSQL backup', {
    event: 'backup.start',
    outputPath
  });

  const result = spawnSync('pg_dump', dumpArgs, {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error(`pg_dump failed: ${result.stderr || result.stdout || 'Unknown error'}`);
  }

  await pruneBackups(backupDir, retentionDays);

  logger.info('PostgreSQL backup completed', {
    event: 'backup.completed',
    outputPath,
    retentionDays
  });

  process.stdout.write(`${outputPath}\n`);
}

run().catch((error) => {
  logger.error('Backup command failed', {
    event: 'backup.failed',
    error: error.message
  });
  process.exit(1);
});
