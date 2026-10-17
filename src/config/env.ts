import { z } from 'zod';

/**
 * Central schema for every environment variable the project reads.
 * Values stay (optional) strings so existing parsing and fallbacks keep working;
 * numeric variables are only checked to be integers when set and non-empty.
 */
const str = z.string().optional();
const intStr = z
  .string()
  .refine((value) => value.trim() === '' || /^-?\d+$/.test(value.trim()), {
    message: 'must be an integer',
  })
  .optional();

const envSchema = z.object({
  NODE_ENV: str,

  // Discord
  DISCORD_TOKEN: str,
  TOKEN: str,
  CLIENT_ID: str,
  GUILD_ID: str,
  TEST_GUILD_ID: str,
  OWNER_IDS: str,
  PREFIX: str,
  MAINTENANCE_MODE: str,

  // Logging / monitoring
  LOG_LEVEL: str,
  LOG_TO_FILE: str,
  SENTRY_DSN: str,

  // Web server
  PORT: intStr,
  PORT_RETRY_ATTEMPTS: intStr,
  WEB_HOST: str,
  CORS_ORIGIN: str,

  // PostgreSQL
  DATABASE_URL: str,
  POSTGRES_URL: str,
  POSTGRES_HOST: str,
  POSTGRES_PORT: intStr,
  POSTGRES_DB: str,
  POSTGRES_USER: str,
  POSTGRES_PASSWORD: str,
  POSTGRES_SSL: str,
  POSTGRES_MAX_CONNECTIONS: intStr,
  POSTGRES_MIN_CONNECTIONS: intStr,
  POSTGRES_IDLE_TIMEOUT: intStr,
  POSTGRES_CONNECTION_TIMEOUT: intStr,
  POSTGRES_RETRIES: intStr,
  POSTGRES_BACKOFF_BASE: intStr,
  POSTGRES_BACKOFF_MULTIPLIER: intStr,
  POSTGRES_MIGRATION_TABLE: str,
  POSTGRES_RESTORE_URL: str,
  AUTO_MIGRATE: str,
  SCHEMA_VERSION: intStr,
  SCHEMA_VERSION_LABEL: str,

  // Backups
  BACKUP_DIR: str,
  BACKUP_RETENTION_DAYS: intStr,

  // Lavalink
  LAVALINK_NODES: str,
  LAVALINK_NODES_FILE: str,
  LAVALINK_HOST: str,
  LAVALINK_PORT: intStr,
  LAVALINK_PASSWORD: str,
  LAVALINK_SECURE: str,
  LAVALINK_NAME: str,
  LAVALINK_SEARCH_PLATFORM: str,
  LAVALINK_REST_VERSION: str,

  // Hosting
  RAILWAY_ENVIRONMENT: str,
  RAILWAY_PROJECT_ID: str,
});

export type Env = z.infer<typeof envSchema>;

function formatProblems(problems: string[]): string {
  return `Invalid environment configuration:\n${problems.map((problem) => `- ${problem}`).join('\n')}`;
}

function issuesToProblems(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

/** Parses process.env on every call (scripts load .env after their imports run). */
export function getEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(formatProblems(issuesToProblems(result.error)));
  }
  return result.data;
}

/** Like getEnv(), but also requires the variables the bot needs to log in. */
export function validateBotEnv(): Env {
  const result = envSchema.safeParse(process.env);
  const problems = result.success ? [] : issuesToProblems(result.error);

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    problems.push('DISCORD_TOKEN (or legacy TOKEN) is required');
  }
  if (!process.env.CLIENT_ID) {
    problems.push('CLIENT_ID is required');
  }

  if (problems.length > 0 || !result.success) {
    throw new Error(formatProblems(problems));
  }
  return result.data;
}
