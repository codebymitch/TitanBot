import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE
  // =========================
  // status: "online" | "idle" | "dnd" | "invisible"
  presence: {
    status: "online",

    // Activities rotate every `rotateInterval` ms.
    // type: 0 = Playing, 2 = Listening, 3 = Watching, 5 = Competing
    rotateInterval: 30000,
    activities: [
      { name: "over {guilds} servers", type: 3 },
      { name: "/help for commands", type: 2 },
      { name: "with {users} members", type: 0 },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    // Comma-separated user IDs in the OWNER_IDS env var.
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],

    // Default cooldown between command uses (seconds).
    defaultCooldown: 5,

    // Remove old commands before re-registering them.
    deleteCommands: false,

    // Guild used for instant command registration while developing.
    devGuildId: process.env.DEV_GUILD_ID,

    // When true, only owners can run commands.
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",

    // Prefix for text commands (e.g. "?ping").
    prefix: process.env.PREFIX || "?",
  },

  // =========================
  // EMBED COLORS & BRANDING
  // =========================
  // Single source of truth for all bot colors.
  embeds: {
    colors: {
      primary: "#7C3AED",
      secondary: "#1E1F22",

      success: "#43B581",
      error: "#F04747",
      warning: "#FAA61A",
      info: "#3B82F6",

      light: "#FFFFFF",
      dark: "#111214",
      gray: "#80848E",

      leveling: "#F59E0B",
      starboard: "#FFD700",
      suggestion: {
        pending: "#80848E",
        approved: "#43B581",
        denied: "#F04747",
      },
      poll: "#3B82F6",
      moderation: "#EF4444",
    },
    footer: {
      text: "Nova Bot",
      icon: null,
    },
    thumbnail: null,
  },

  // =========================
  // LEVELING SYSTEM
  // =========================
  leveling: {
    // XP awarded per message (random between min and max).
    xpMin: 10,
    xpMax: 20,

    // Seconds between XP gains per user (prevents spam farming).
    xpCooldown: 60,

    // Level formula: XP needed for next level = base * level^exponent
    baseXp: 100,
    exponent: 1.5,

    // XP multipliers by role ID, e.g. { "123456789": 1.5 }
    roleMultipliers: {},

    // Channel IDs that never give XP.
    ignoredChannels: [],

    // Role rewards by level, e.g. { 5: "roleId", 10: "roleId" }
    roleRewards: {},

    levelUpMessage: "🎉 {user} reached **level {level}**!",
    // null = reply in the same channel
    levelUpChannel: null,
  },

  // =========================
  // AUTOMOD
  // =========================
  automod: {
    // Block messages containing these words.
    bannedWords: [],

    antiSpam: {
      enabled: true,
      // More than `maxMessages` in `interval` ms counts as spam.
      maxMessages: 5,
      interval: 5000,
      // Timeout length in seconds.
      timeoutDuration: 60,
    },

    antiInvite: {
      enabled: false,
      // Role IDs allowed to post invites.
      bypassRoles: [],
    },

    antiCaps: {
      enabled: false,
      // Percent of capital letters that triggers a delete.
      threshold: 70,
      minLength: 10,
    },

    // Channel ID for automod logs.
    logChannel: null,
  },

  // =========================
  // STARBOARD
  // =========================
  starboard: {
    emoji: "⭐",
    // Reactions required to reach the starboard.
    threshold: 3,
    channel: null,
    // Allow users to star their own messages.
    selfStar: false,
    ignoredChannels: [],
  },

  // =========================
  // SUGGESTIONS
  // =========================
  suggestions: {
    channel: null,
    upvoteEmoji: "👍",
    downvoteEmoji: "👎",
    // Role IDs that can approve/deny suggestions.
    reviewerRoles: [],
    // Allow staff to leave a reason when reviewing.
    requireReason: false,
  },

  // =========================
  // POLLS
  // =========================
  polls: {
    maxOptions: 10,
    // Duration limits in milliseconds.
    minDuration: 60 * 1000,
    maxDuration: 7 * 24 * 60 * 60 * 1000,
    defaultDuration: 24 * 60 * 60 * 1000,
  },

  // =========================
  // MODERATION
  // =========================
  moderation: {
    // Channel ID for mod-action logs.
    logChannel: null,

    // Role IDs that can use moderation commands.
    modRoles: [],

    // DM the user when they are warned/kicked/banned.
    dmOnAction: true,

    // Warning thresholds -> automatic punishments.
    warnThresholds: {
      3: { action: "timeout", duration: 60 * 60 }, // seconds
      5: { action: "kick" },
      7: { action: "ban" },
    },

    // Delete messages from the last N days when banning (0-7).
    banDeleteDays: 1,
  },

  // =========================
  // WELCOME / GOODBYE
  // =========================
  // Placeholders: {user}, {server}, {memberCount}
  welcome: {
    welcomeMessage: "Hey {user}, welcome to **{server}**! You're member #{memberCount}.",
    goodbyeMessage: "{user} left **{server}**. We're now at {memberCount} members.",
    welcomeChannel: null,
    goodbyeChannel: null,
    // Role IDs given automatically on join.
    autoRoles: [],
  },

  // =========================
  // GENERIC BOT MESSAGES
  // =========================
  messages: {
    noPermission: "❌ You don't have permission to use this command.",
    cooldownActive: "⏳ Slow down! Try again in {time}.",
    errorOccurred: "⚠️ Something went wrong while running that command.",
    missingPermissions: "❌ I'm missing the permissions I need to do that.",
    commandDisabled: "🚫 This command is currently disabled.",
    maintenanceMode: "🔧 Nova is in maintenance mode. Please check back soon.",
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
  // Set a feature to `false` to disable it globally.
  features: {
    leveling: true,
    automod: true,
    moderation: true,
    logging: true,
    welcome: true,
    starboard: true,
    suggestions: true,
    polls: true,
    fun: true,
    utility: true,
  },
};

// =========================
// VALIDATION
// =========================
export function validateConfig() {
  const errors = [];

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required (DISCORD_TOKEN or TOKEN environment variable)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required (CLIENT_ID environment variable)");
  }

  if (botConfig.leveling.xpMin > botConfig.leveling.xpMax) {
    errors.push("leveling.xpMin cannot be greater than leveling.xpMax");
  }

  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required in production");
  }

  return errors;
}

const configErrors = validateConfig();
if (configErrors.length > 0) {
  logger.error("Bot configuration errors:\n" + configErrors.join("\n"));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

// =========================
// HELPERS
// =========================
const COMMAND_CATEGORY_FEATURE_MAP = {
  leveling: "leveling",
  automod: "automod",
  moderation: "moderation",
  logging: "logging",
  welcome: "welcome",
  starboard: "starboard",
  suggestions: "suggestions",
  polls: "polls",
  fun: "fun",
  utility: "utility",
};

function normalizeCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCommandPrefix() {
  return botConfig.commands.prefix ?? "?";
}

export function getBotOwners() {
  return (botConfig.commands.owners ?? []).map((id) => String(id).trim()).filter(Boolean);
}

export function isBotOwner(userId) {
  return !!userId && getBotOwners().includes(String(userId));
}

export function isMaintenanceMode() {
  return botConfig.commands.maintenanceMode === true;
}

export function getBotMessage(key, replacements = {}) {
  let message = botConfig.messages?.[key] || key;

  for (const [placeholder, value] of Object.entries(replacements)) {
    message = message.replaceAll(`{${placeholder}}`, String(value));
  }

  return message;
}

export function isFeatureEnabled(featureKey) {
  if (!featureKey) return true;
  return botConfig.features?.[featureKey] !== false;
}

export function isCommandCategoryEnabled(category) {
  const normalized = normalizeCategoryKey(category);
  if (!normalized || normalized === "core") return true;

  const featureKey = COMMAND_CATEGORY_FEATURE_MAP[normalized];
  return featureKey ? isFeatureEnabled(featureKey) : true;
}

// XP needed to go from `level` to `level + 1`.
export function getXpForLevel(level) {
  const { baseXp, exponent } = botConfig.leveling;
  return Math.floor(baseXp * Math.pow(level, exponent));
}

// Accepts "#RRGGBB", a number, or a dot path like "suggestion.approved".
export function getColor(path, fallback = "#80848E") {
  if (typeof path === "number") return path;

  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.slice(1), 16);
  }

  const result = String(path)
    .split(".")
    .reduce(
      (obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined),
      botConfig.embeds.colors,
    );

  const hex = typeof result === "string" ? result : fallback;
  return parseInt(hex.replace("#", ""), 16);
}

export const BotConfig = botConfig;
export default botConfig;
