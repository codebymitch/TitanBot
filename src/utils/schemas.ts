// schemas.js

import { z } from 'zod';
import { createError, ErrorTypes } from './errorHandler.js';

export const LogIgnoreSchema = z
  .object({
    users: z.array(z.string()).default([]),
    channels: z.array(z.string()).default([])
  })
  .default({ users: [], channels: [] });

export const LoggingChannelsSchema = z
  .object({
    audit: z.string().nullable().optional(),
    applications: z.string().nullable().optional(),
    reports: z.string().nullable().optional(),
  })
  .default({ audit: null, applications: null, reports: null });

export const LoggingConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    channels: LoggingChannelsSchema.optional(),
    ignore: LogIgnoreSchema.optional(),
    enabledEvents: z.record(z.boolean()).default({}),
    // legacy flat fields — accepted on parse, stripped on normalize
    channelId: z.string().nullable().optional(),
  })
  .default({ enabled: false, enabledEvents: {} });

const TicketLoggingSchema = z
  .object({
    lifecycleChannelId: z.string().nullable().optional(),
    transcriptChannelId: z.string().nullable().optional()
  })
  .optional();

const AutoVerifyConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    criteria: z.enum(['account_age', 'server_size', 'none']).default('none'),
    accountAgeDays: z.number().int().min(1).max(365).nullable().optional(),
    roleId: z.string().nullable().optional()
  })
  .optional();

const VerificationConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullable().optional(),
    messageId: z.string().nullable().optional(),
    roleId: z.string().optional(),
    message: z.string().optional(),
    buttonText: z.string().default('Verify'),
    autoVerify: AutoVerifyConfigSchema
  })
  .optional();

export const GuildConfigSchema = z
  .object({
    prefix: z.string().optional(),
    modRole: z.string().nullable().optional(),
    adminRole: z.string().nullable().optional(),
    logChannelId: z.string().nullable().optional(),
    welcomeChannel: z.string().nullable().optional(),
    welcomeMessage: z.string().optional(),
    autoRole: z.string().nullable().optional(),
    dmOnClose: z.boolean().optional(),
    reportChannelId: z.string().nullable().optional(),
    birthdayChannelId: z.string().nullable().optional(),
    premiumRoleId: z.string().nullable().optional(),
    logIgnore: LogIgnoreSchema.optional(),
    disabledCommands: z.record(z.boolean()).optional(),
    disabledCategories: z.record(z.boolean()).optional(),
    logging: LoggingConfigSchema.optional(),
    ticketLogging: TicketLoggingSchema.optional(),
    enableLogging: z.boolean().optional(),
    verification: VerificationConfigSchema
  })
  .passthrough();

export const EconomyDataSchema = z
  .object({
    wallet: z.number().nonnegative().default(0),
    bank: z.number().nonnegative().default(0),
    bankLevel: z.number().int().nonnegative().default(0),
    dailyStreak: z.number().int().nonnegative().default(0),
    lastDaily: z.number().int().nonnegative().default(0),
    lastWeekly: z.number().int().nonnegative().default(0),
    lastWork: z.number().int().nonnegative().default(0),
    lastCrime: z.number().int().nonnegative().default(0),
    lastRob: z.number().int().nonnegative().default(0),
    lastDeposit: z.number().int().nonnegative().default(0),
    lastWithdraw: z.number().int().nonnegative().default(0),
    xp: z.number().int().nonnegative().default(0),
    level: z.number().int().nonnegative().default(1),
    inventory: z.record(z.unknown()).default({}),
    cooldowns: z.record(z.number().int().nonnegative()).default({})
  })
  .passthrough();

/** Stored per-guild configuration (passthrough: unknown keys are kept). */
type GuildConfigData = z.infer<typeof GuildConfigSchema>;

/** Stored per-user economy record. */
export type EconomyData = z.infer<typeof EconomyDataSchema>;

type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

/** Loose view of a stored (possibly legacy) logging config. */
interface RawLoggingConfig {
  enabled?: boolean;
  channelId?: string | null;
  channels?: { audit?: string | null; applications?: string | null; reports?: string | null } | null;
  ignore?: { users?: string[]; channels?: string[] } | null;
  enabledEvents?: Record<string, boolean>;
  [key: string]: unknown;
}

interface LegacyLoggingFields {
  logChannelId?: string | null;
  reportChannelId?: string | null;
  enableLogging?: unknown;
  logIgnore?: { users?: string[]; channels?: string[] } | null;
}

const DEFAULT_LOGGING: LoggingConfig = {
  enabled: false,
  channels: { audit: null, applications: null, reports: null },
  ignore: { users: [], channels: [] },
  enabledEvents: {},
};

function migrateLoggingConfig(raw: unknown = {}, legacy: LegacyLoggingFields = {}): LoggingConfig {
  const base: RawLoggingConfig = typeof raw === 'object' && raw !== null ? (raw as RawLoggingConfig) : {};
  const {
    logChannelId,
    reportChannelId,
    enableLogging,
    logIgnore,
  } = legacy;

  const auditChannel =
    base.channels?.audit ??
    base.channelId ??
    logChannelId ??
    null;

  const applicationsChannel = base.channels?.applications ?? null;

  const reportsChannel =
    base.channels?.reports ??
    reportChannelId ??
    null;

  const ignore = {
    users: base.ignore?.users ?? logIgnore?.users ?? [],
    channels: base.ignore?.channels ?? logIgnore?.channels ?? [],
  };

  let enabled = base.enabled ?? false;
  if (enableLogging === false) {
    enabled = false;
  } else if (auditChannel && base.enabled === undefined && enableLogging !== false) {
    enabled = base.enabled ?? Boolean(enableLogging);
  }

  const { channelId: _legacyChannelId, ignore: _ignore, channels: _channels, ...rest } = base;

  return {
    ...DEFAULT_LOGGING,
    ...rest,
    enabled,
    channels: {
      audit: auditChannel,
      applications: applicationsChannel,
      reports: reportsChannel,
    },
    ignore,
    enabledEvents: base.enabledEvents ?? {},
  };
}

export function stripLegacyLoggingFields<T>(config: T): T {
  if (!config || typeof config !== 'object') {
    return config;
  }

  const {
    logChannelId: _logChannelId,
    enableLogging: _enableLogging,
    reportChannelId: _reportChannelId,
    logIgnore: _logIgnore,
    ...rest
  } = config as Record<string, unknown>;

  if (rest.logging && typeof rest.logging === 'object') {
    const { channelId: _channelId, ...loggingRest } = rest.logging as Record<string, unknown>;
    rest.logging = loggingRest;
  }

  return rest as T;
}

export function normalizeGuildConfig(raw: unknown, defaults: Record<string, unknown> = {}): GuildConfigData {
  const base = typeof raw === 'object' && raw !== null ? raw : {};
  // Unvalidated until safeParse below; typed as the target shape for the legacy-field migration.
  const merged = { ...defaults, ...base } as GuildConfigData;

  merged.logging = migrateLoggingConfig(merged.logging, {
    logChannelId: merged.logChannelId,
    reportChannelId: merged.reportChannelId,
    enableLogging: merged.enableLogging,
    logIgnore: merged.logIgnore,
  });

  const parsed = GuildConfigSchema.safeParse(merged);
  const normalized = parsed.success ? parsed.data : { ...defaults, ...merged };

  normalized.logging = migrateLoggingConfig(normalized.logging, {
    logChannelId: normalized.logChannelId,
    reportChannelId: normalized.reportChannelId,
    enableLogging: normalized.enableLogging,
    logIgnore: normalized.logIgnore,
  });

  return stripLegacyLoggingFields(normalized);
}

export function normalizeEconomyData(raw: unknown, defaults: Record<string, unknown> = {}): EconomyData {
  const base = typeof raw === 'object' && raw !== null ? raw : {};
  const merged = { ...defaults, ...base };
  const parsed = EconomyDataSchema.safeParse(merged);
  // Fallback keeps the unvalidated record as-is (original behaviour).
  return parsed.success ? parsed.data : ({ ...defaults, ...base } as EconomyData);
}

export function validateGuildConfigOrThrow(rawConfig: unknown, context: Record<string, unknown> = {}): GuildConfigData {
  const normalized = normalizeGuildConfig(rawConfig);
  const parsed = GuildConfigSchema.safeParse(normalized);

  if (parsed.success) {
    return stripLegacyLoggingFields({
      ...normalized,
      logging: migrateLoggingConfig(normalized.logging, {}),
    });
  }

  throw createError(
    'Invalid guild configuration payload',
    ErrorTypes.VALIDATION,
    'Die Konfiguration ist ungültig. Bitte prüfe die Werte und versuch es erneut.',
    {
      ...context,
      errorCode: 'VALIDATION_FAILED',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }))
    }
  );
}
