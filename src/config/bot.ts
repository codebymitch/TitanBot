import type { Guild, PresenceData } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getEnv } from './env.js';

const env = getEnv();

export const botConfig = {
  // =========================
  // BOT PRESENCE (what users see under the bot name)
  // =========================
  // `status` options:
  // - "online"    = green dot
  // - "idle"      = yellow moon
  // - "dnd"       = red do-not-disturb
  // - "invisible" = appears offline
  presence: {
    // Current online state shown on Discord.
    status: "online",

    // Activity lines shown under the bot name.
    // `type` number mapping from Discord:
    // 0 = Playing
    // 1 = Streaming
    // 2 = Listening
    // 3 = Watching
    // 4 = Custom
    // 5 = Competing
    activities: [
      {
        name: "Custom Status", // required by Discord API, not shown in the client
        state: "auf der Lauer",     // this is what people actually see
        type: 4,               // Custom
      },
    ],
  } satisfies PresenceData,

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    // Bot owner user IDs (comma-separated in OWNER_IDS env var).
    // Owners can access owner/admin-level bot commands.
    owners: env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],

    // Default wait time between command uses (in seconds).
    defaultCooldown: 3,

    // If true, old commands are removed before re-registering.
    deleteCommands: false,

    // Optional server ID retained for tutorial compatibility; not used for command registration.
    testGuildId: env.TEST_GUILD_ID,

    // When true (or MAINTENANCE_MODE=true), only bot owners can run commands.
    maintenanceMode: env.MAINTENANCE_MODE === "true",

    // Command prefix for text-based commands (e.g., "!" for "!ping").
    // Supports both slash commands and prefix commands.
    prefix: env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM
  // =========================
  applications: {
    // Default questions shown when someone fills out an application.
    defaultQuestions: [
      { question: "Wie heißt du?", required: true },
      { question: "Wie alt bist du?", required: true },
      { question: "Warum möchtest du beitreten?", required: true },
    ],

    // Embed colors by application status.
    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },

    // How long users must wait before submitting another application (hours).
    applicationCooldown: 24,

    // Auto-delete denied applications after this many days.
    deleteDeniedAfter: 7,

    // Auto-delete approved applications after this many days.
    deleteApprovedAfter: 30,

    // Role IDs allowed to manage applications.
    managerRoles: [] as string[], // Will be populated from environment or database
  },

  // =========================
  // EMBED COLORS & BRANDING
  // =========================
  // IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all bot colors
  embeds: {
    colors: {
      // Main brand colors.
      primary: "#7C5CFF",
      secondary: "#22D3EE",

      // Standard status colors for success/error/warning/info messages.
      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",

      // Neutral utility colors.
      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",

      // Discord-style palette shortcuts.
      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",

      // Feature-specific colors.
      giveaway: {
        active: "#57F287",
        ended: "#ED4245",
      },
      ticket: {
        open: "#57F287",
        claimed: "#FAA61A",
        closed: "#ED4245",
        pending: "#99AAB5",
      },
      economy: "#F1C40F",
      birthday: "#E91E63",
      moderation: "#9B59B6",

      // Ticket priority color mapping.
      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },
    },
    footer: {
      // Default footer text used in bot embeds.
      text: "Nexo",
      // Footer icon URL (null = no icon).
      icon: null as string | null,
    },
    // Default thumbnail URL for embeds (null = no thumbnail).
    thumbnail: null as string | null,
    author: {
      // Optional default embed author block.
      name: null as string | null,
      icon: null as string | null,
      url: null as string | null,
    },
  },

  // =========================
  // ECONOMY SETTINGS
  // =========================
  economy: {
    currency: {
      // Currency display name.
      name: "Münzen",
      // Plural display name.
      namePlural: "Münzen",
      // Currency symbol shown in balances.
      symbol: "$",
    },

    // Starting balance for new users.
    startingBalance: 0,

    // Maximum bank amount before upgrades (if upgrades are used).
    baseBankCapacity: 100000,

    // Daily reward amount.
    dailyAmount: 100,

    // Work command random payout range.
    workMin: 10,
    workMax: 100,

    // Beg command random payout range.
    begMin: 5,
    begMax: 50,

    // Command cooldowns (milliseconds).
    cooldowns: {
      daily: 24 * 60 * 60 * 1000,
      work: 60 * 60 * 1000,
      crime: 2 * 60 * 60 * 1000,
      rob: 4 * 60 * 60 * 1000,
    },

    // Chance to succeed when robbing (0.4 = 40%).
    robSuccessRate: 0.4,

    // Jail time after failed rob (milliseconds).
    // 3600000 = 1 hour.
    robFailJailTime: 3600000,
  },

  // =========================
  // SHOP SETTINGS
  // =========================
  // Add shop defaults here when needed.
  shop: {

  },

  // =========================
  // TICKET SYSTEM
  // =========================
  tickets: {
    // Category ID where new tickets are created (null = no forced category).
    defaultCategory: null as string | null,

    // Role IDs allowed to manage/support tickets.
    supportRoles: [] as string[],

    // Priority options users/staff can assign.
    priorities: {
      none: {
        emoji: "⚪",
        color: "#95A5A6",
        label: "Keine",
      },
      low: {
        emoji: "🟢",
        color: "#2ECC71",
        label: "Niedrig",
      },
      medium: {
        emoji: "🟡",
        color: "#F1C40F",
        label: "Mittel",
      },
      high: {
        emoji: "🔴",
        color: "#E74C3C",
        label: "Hoch",
      },
      urgent: {
        emoji: "🚨",
        color: "#E91E63",
        label: "Dringend",
      },
    },

    // Default priority for new tickets.
    defaultPriority: "none",

    // Category ID where closed tickets are archived.
    archiveCategory: null as string | null,

    // Channel ID where ticket logs are sent.
    logChannel: null as string | null,
  },

  // =========================
  // GIVEAWAY SETTINGS
  // =========================
  giveaways: {
    // Default giveaway duration in milliseconds.
    // 86400000 = 24 hours.
    defaultDuration: 86400000,

    // Allowed winner count range.
    minimumWinners: 1,
    maximumWinners: 10,

    // Allowed giveaway duration range in milliseconds.
    // 300000 = 5 minutes.
    minimumDuration: 300000,
    // 2592000000 = 30 days.
    maximumDuration: 2592000000,

    // Role IDs allowed to host giveaways.
    allowedRoles: [] as string[],

    // Role IDs that bypass giveaway restrictions.
    bypassRoles: [] as string[],
  },

  // =========================
  // BIRTHDAY SETTINGS
  // =========================
  birthday: {
    // Role ID given to users on their birthday.
    defaultRole: null as string | null,

    // Channel ID where birthday announcements are posted.
    announcementChannel: null as string | null,

    // Timezone used to calculate birthday dates.
    timezone: "UTC",
  },

  // =========================
  // VERIFICATION SETTINGS
  // =========================
  verification: {
    // Message shown when posting the verification panel.
    defaultMessage: "Klicke auf den Button unten, um dich zu verifizieren und Zugang zum Server zu erhalten!",

    // Text on the verification button.
    defaultButtonText: "Verifizieren",

    // Automatic verification behavior.
    autoVerify: {
      // How automatic verification decides who is auto-approved:
      // - "none"        = everyone is auto-verified immediately
      // - "account_age" = account must be older than set days
      // - "server_size" = auto-verify everyone only in smaller servers
      defaultCriteria: "none",

      // Days used when `defaultCriteria` is `account_age`.
      defaultAccountAgeDays: 7,

      // Member count threshold used when `defaultCriteria` is `server_size`.
      // Example: 1000 means auto-verify if server has fewer than 1000 members.
      serverSizeThreshold: 1000,

      // Allowed safety limits for account-age requirements.
      // 1 = minimum day, 365 = maximum days.
      minAccountAge: 1,
      maxAccountAge: 365,

      // If true, user receives a DM after verification.
      sendDMNotification: true,

      // Human-readable descriptions for each criteria mode.
      criteria: {
        account_age: "Account muss älter als die angegebene Anzahl Tage sein",
        server_size: "Alle Nutzer, wenn der Server weniger als 1000 Mitglieder hat",
        none: "Alle Nutzer sofort"
      }
    },

    // Minimum time between verification attempts (milliseconds).
    // 5000 = 5 seconds.
    verificationCooldown: 5000,

    // Maximum failed attempts allowed inside the time window below.
    maxVerificationAttempts: 3,

    // Time window for counting attempts (milliseconds).
    // 60000 = 1 minute.
    attemptWindow: 60000,

    // In-memory safety limits (helps avoid unbounded memory growth).
    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,
    // Cleanup frequency for cooldown/attempt maps (milliseconds).
    // 300000 = 5 minutes.
    cooldownCleanupInterval: 300000,
    // Maximum metadata payload size for audit entries (bytes).
    maxAuditMetadataBytes: 4096,
    // Maximum number of audit entries kept in memory.
    maxInMemoryAuditEntries: 1000,
    // If true, log every verification action.
    logAllVerifications: true,
    // If true, preserve verification audit history.
    keepAuditTrail: true,
  },

  // =========================
  // WELCOME / GOODBYE MESSAGES
  // =========================
  welcome: {
    // Welcome template posted when a user joins.
    // Placeholders: {user}, {server}, {memberCount}
    defaultWelcomeMessage:
      "Willkommen {user} auf {server}! Wir sind jetzt {memberCount} Mitglieder!",
    // Goodbye template posted when a user leaves.
    // Placeholders: {user}, {memberCount}
    defaultGoodbyeMessage:
      "{user} hat den Server verlassen. Wir sind jetzt {memberCount} Mitglieder.",
    // Channel ID for welcome messages.
    defaultWelcomeChannel: null as string | null,
    // Channel ID for goodbye messages.
    defaultGoodbyeChannel: null as string | null,
  },

  // =========================
  // COUNTER CHANNELS
  // =========================
  counters: {
    defaults: {
      // Default naming/description templates for counter entries.
      name: "{name}-Zähler",
      description: "Server-Zähler: {name}",
      // Channel type used for counters (typically "voice").
      type: "voice",
      // Channel name format. `{count}` is replaced automatically.
      channelName: "{name}-{count}",
    },
    permissions: {
      // Default denied permissions for the counter channel.
      deny: ["VIEW_CHANNEL"],
      // Default allowed permissions for the counter channel.
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      // Default response messages for counter actions.
      created: "✅ Zähler **{name}** erstellt",
      deleted: "🗑️ Zähler **{name}** gelöscht",
      updated: "🔄 Zähler **{name}** aktualisiert",
    },
    types: {
      // Built-in counter types and how each count is calculated.
      members: {
        name: "👥 Mitglieder",
        description: "Mitglieder insgesamt auf dem Server",
        getCount: (guild: Guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 Bots",
        description: "Bot-Accounts insgesamt auf dem Server",
        getCount: (guild: Guild) =>
          guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "👤 Menschen",
        description: "Menschliche Mitglieder insgesamt (ohne Bots)",
        getCount: (guild: Guild) =>
          guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // GENERIC BOT MESSAGES
  // =========================
  messages: {
    noPermission: "Du hast keine Berechtigung, diesen Command zu nutzen.",
    cooldownActive: "Bitte warte {time}, bevor du diesen Command erneut nutzt.",
    errorOccurred: "Beim Ausführen dieses Commands ist ein Fehler aufgetreten.",
    missingPermissions:
      "Mir fehlen die nötigen Berechtigungen für diese Aktion.",
    commandDisabled: "Dieser Command wurde deaktiviert.",
    maintenanceMode: "Der Bot befindet sich gerade im Wartungsmodus.",
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
  // Set any feature to `false` to disable it globally.
  features: {
    // Core systems.
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,

    // Community engagement systems.
    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,

    // Security and self-service systems.
    verification: true,
    reactionRoles: true,
    joinToCreate: true,

    // Utility/quality-of-life modules.
    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
    music: true,
  },
};

export type BotConfigShape = typeof botConfig;
export type FeatureKey = keyof BotConfigShape["features"];

export function validateConfig(config: BotConfigShape): string[] {
  const errors: string[] = [];
  const env = getEnv();

  if (env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug('DISCORD_TOKEN exists:', !!env.DISCORD_TOKEN);
    logger.debug('TOKEN exists:', !!env.TOKEN);
    logger.debug('CLIENT_ID exists:', !!env.CLIENT_ID);
    logger.debug('GUILD_ID exists:', !!env.GUILD_ID);
    logger.debug('POSTGRES_HOST exists:', !!env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', env.NODE_ENV);
  }

  if (!env.DISCORD_TOKEN && !env.TOKEN) {
    errors.push("Bot token is required (DISCORD_TOKEN or TOKEN environment variable)");
  }

  if (!env.CLIENT_ID) {
    errors.push("Client ID is required (CLIENT_ID environment variable)");
  }

  if (env.NODE_ENV === 'production') {
    // A full connection URL (DATABASE_URL / POSTGRES_URL) satisfies all Postgres
    // requirements, matching how src/config/database/postgres.js resolves the pool config.
    const hasConnectionUrl = Boolean(env.POSTGRES_URL || env.DATABASE_URL);

    if (!hasConnectionUrl) {
      if (!env.POSTGRES_HOST) {
        errors.push("PostgreSQL connection is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_HOST)");
      }
      if (!env.POSTGRES_USER) {
        errors.push("PostgreSQL user is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_USER)");
      }
      if (!env.POSTGRES_PASSWORD) {
        errors.push("PostgreSQL password is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_PASSWORD)");
      }
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Bot configuration errors:", configErrors.join("\n"));
  if (env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

const COMMAND_CATEGORY_FEATURE_MAP: Record<string, FeatureKey> = {
  birthday: "birthday",
  community: "community",
  economy: "economy",
  fun: "fun",
  giveaway: "giveaways",
  jointocreate: "joinToCreate",
  leveling: "leveling",
  logging: "logging",
  moderation: "moderation",
  music: "music",
  reaction_roles: "reactionRoles",
  search: "search",
  serverstats: "counter",
  ticket: "tickets",
  tools: "tools",
  utility: "utility",
  verification: "verification",
  welcome: "welcome",
};

function normalizeCategoryKey(category: string | null | undefined): string {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCommandPrefix(): string {
  return botConfig.commands?.prefix ?? "!";
}

export function getBotOwners(): string[] {
  return (botConfig.commands?.owners ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
}

export function isBotOwner(userId: string | null | undefined): boolean {
  if (!userId) {
    return false;
  }

  return getBotOwners().includes(String(userId));
}

export function isMaintenanceMode(): boolean {
  return botConfig.commands?.maintenanceMode === true;
}

export function getBotMessage(key: string, replacements: Record<string, string | number> = {}): string {
  const messages: Partial<Record<string, string>> = botConfig.messages;
  let message = messages?.[key] || key;

  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.replace(new RegExp(`\\{${placeholder}\\}`, "g"), String(value));
  }

  return message;
}

export function isFeatureEnabled(featureKey: string | null | undefined): boolean {
  if (!featureKey) {
    return true;
  }

  const features: Partial<Record<string, boolean>> = botConfig.features;
  return features?.[featureKey] !== false;
}

export function isCommandCategoryEnabled(category: string | null | undefined): boolean {
  const normalized = normalizeCategoryKey(category);

  if (!normalized || normalized === "core") {
    return true;
  }

  const featureKey: FeatureKey | undefined = COMMAND_CATEGORY_FEATURE_MAP[normalized];
  if (!featureKey) {
    return true;
  }

  return isFeatureEnabled(featureKey);
}

export function getApplicationStatusColor(status: string): number {
  const colors: Partial<Record<string, string>> = botConfig.applications?.statusColors || {};
  const hex = colors[status];
  return hex ? getColor(hex) : getColor(status === "approved" ? "success" : status === "denied" ? "error" : "warning");
}

export function getDefaultApplicationQuestions(): string[] {
  return (botConfig.applications?.defaultQuestions || []).map((entry) =>
    typeof entry === "string" ? entry : entry.question,
  ).filter(Boolean);
}

export function getColor(path: string | number, fallback: string = "#99AAB5"): number {
  
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) {
    
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path
    .split(".")
    .reduce<unknown>(
      (obj, key) => (obj && (obj as Record<string, unknown>)[key] !== undefined ? (obj as Record<string, unknown>)[key] : fallback),
      botConfig.embeds.colors,
    );
  
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  // Non-hex results (a color group or a non-hex fallback) are passed through unchanged, as before.
  return result as number;
}

export function getRandomColor(): string {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );
  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;