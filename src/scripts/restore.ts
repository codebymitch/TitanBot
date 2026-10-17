import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';
import { getEnv } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

type CliArgs = Record<string, string | true>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

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

function ensureCommand(command: string): void {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error(`${command} is required but was not found in PATH.`);
  }
}

async function resolveLatestBackup(backupDir: string): Promise<string> {
  const entries = await readdir(backupDir, { withFileTypes: true });
  const dumpFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.dump'))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  if (dumpFiles.length === 0) {
    throw new Error(`No .dump backup files found in ${backupDir}`);
  }

  return path.join(backupDir, dumpFiles[0]);
}

function runCommand(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || 'Unknown error'}`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const env = getEnv();
  const backupDir = path.resolve(String(args['backup-dir'] || env.BACKUP_DIR || path.join(process.cwd(), 'backups')));
  const targetUrl = args['target-url'] || env.POSTGRES_RESTORE_URL || env.POSTGRES_URL;

  if (!targetUrl) {
    throw new Error('Missing target database URL. Set POSTGRES_RESTORE_URL or POSTGRES_URL.');
  }

  if (!args.confirm) {
    throw new Error('Restore requires explicit confirmation. Re-run with --confirm.');
  }

  ensureCommand('pg_restore');
  ensureCommand('psql');

  const inputPath = args.input ? path.resolve(String(args.input)) : await resolveLatestBackup(backupDir);
  const dropSchema = args['drop-schema'] === true || args['drop-schema'] === 'true';

  logger.warn('Starting database restore', {
    event: 'restore.start',
    inputPath,
    targetUrl,
    dropSchema
  });

  if (dropSchema) {
    runCommand('psql', [
      '--dbname',
      String(targetUrl),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;'
    ]);
  }

  runCommand('pg_restore', [
    '--clean',
    '--if-exists',
    '--no-owner',
    '--no-privileges',
    '--dbname',
    String(targetUrl),
    inputPath
  ]);

  logger.info('Database restore completed', {
    event: 'restore.completed',
    inputPath,
    targetUrl
  });
}

run().catch((error) => {
  logger.error('Restore command failed', {
    event: 'restore.failed',
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});