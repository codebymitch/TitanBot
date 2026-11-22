import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE
  // =========================
  // status: "online" | "idle" | "dnd" | "invisible"
  presence: {
    status: "online",

    // type: 0 = Playing, 1 = Streaming, 2 = Listening, 3 = Watching, 4 = Custom, 5 = Competing
    activities: [
      {
        name: "Custom Status", // required by Discord API, not shown in the client
        state: "Watching over the server", // what people actually see
        type: 4,
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    // Comma-separated user IDs in the OWNER_IDS env var.
    owners: process.env.OWNER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) || [],

    // Default cooldown between command uses (seconds).
    defaultCooldown: 3,

    // If true, old commands are removed before re-registering.
    deleteCommands: false,

    // Guild used while developing; kept for compatibility.
    testGuildId: process.env.TEST_GUILD_ID,

    // When true (or MAINTENANCE_MODE=true), only owners can run commands.
    maintenanceMode: process.env.MAINTENANCE_MODE === "true",

    // Prefix for text commands (e.g. "!ping").
    prefix: process.env.PREFIX || "!",
  },

  // =========================
  // APPLICATIONS SYSTEM
  // =========================
  applications: {
    defaultQuestions: [
      { question: "What is your name?", required: true },
      { question: "How old are you?", required: true },
      { question: "Why do you want to join?", required: true },
    ],

    statusColors: {
      pending: "#FFA500",
      approved: "#00FF00",
      denied: "#FF0000",
    },

    // Hours a user must wait before submitting another application.
    applicationCooldown: 24,

    // Auto-delete denied/approved applications after this many days.
    deleteDeniedAfter: 7,
    deleteApprovedAfter: 30,

    // Role IDs allowed to manage applications.
    managerRoles: [],
  },

  // =========================
  // EMBED COLORS & BRANDING
  // =========================
  // SINGLE SOURCE OF TRUTH for all bot colors.
  embeds: {
    colors: {
      primary: "#7C3AED",
      secondary: "#2F3136",

      success: "#57F287",
      error: "#ED4245",
      warning: "#FEE75C",
      info: "#3498DB",

      light: "#FFFFFF",
      dark: "#202225",
      gray: "#99AAB5",

      blurple: "#5865F2",
      green: "#57F287",
      yellow: "#FEE75C",
      fuchsia: "#EB459E",
      red: "#ED4245",
      black: "#000000",

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

      priority: {
        none: "#95A5A6",
        low: "#3498db",
        medium: "#2ecc71",
        high: "#f1c40f",
        urgent: "#e74c3c",
      },

      // New in Nova
      leveling: "#F59E0B",
      starboard: "#FFD700",
      poll: "#3B82F6",
      suggestion: {
        pending: "#99AAB5",
        approved: "#57F287",
        denied: "#ED4245",
      },
    },
    footer: {
      text: "Nova Bot",
      icon: null,
    },
    thumbnail: null,
    author: {
      name: null,
      icon: null,
      url: null,
    },
  },

  // =========================
  // ECONOMY SETTINGS
  // =========================
  economy: {
    currency: {
      name: "coins",
      namePlural: "coins",
      symbol: "$",
    },

    startingBalance: 0,
    baseBankCapacity: 100000,
    dailyAmount: 100,

    workMin: 10,
    workMax: 100,

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

    // Jail time after a failed rob (ms). 3600000 = 1 hour.
    robFailJailTime: 3600000,
  },

  // =========================
  // SHOP SETTINGS
  // =========================
  shop: {},

  // =========================
  // TICKET SYSTEM
  // =========================
  tickets: {
    defaultCategory: null,
    supportRoles: [],

    priorities: {
      none: { emoji: "⚪", color: "#95A5A6", label: "None" },
      low: { emoji: "🟢", color: "#2ECC71", label: "Low" },
      medium: { emoji: "🟡", color: "#F1C40F", label: "Medium" },
      high: { emoji: "🔴", color: "#E74C3C", label: "High" },
      urgent: { emoji: "🚨", color: "#E91E63", label: "Urgent" },
    },

    defaultPriority: "none",
    archiveCategory: null,
    logChannel: null,
  },

  // =========================
  // GIVEAWAY SETTINGS
  // =========================
  giveaways: {
    defaultDuration: 86400000, // 24 hours
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000, // 5 minutes
    maximumDuration: 2592000000, // 30 days
    allowedRoles: [],
    bypassRoles: [],
  },

  // =========================
  // BIRTHDAY SETTINGS
  // =========================
  birthday: {
    defaultRole: null,
    announcementChannel: null,
    timezone: "UTC",
  },

  // =========================
  // VERIFICATION SETTINGS
  // =========================
  verification: {
    defaultMessage: "Click the button below to verify yourself and gain access to the server!",
    defaultButtonText: "Verify",

    autoVerify: {
      // "none" | "account_age" | "server_size"
      defaultCriteria: "none",
      defaultAccountAgeDays: 7,
      serverSizeThreshold: 1000,
      minAccountAge: 1,
      maxAccountAge: 365,
      sendDMNotification: true,

      criteria: {
        account_age: "Account must be older than specified days",
        server_size: "All users if server has less than 1000 members",
        none: "All users immediately",
      },
    },

    verificationCooldown: 5000,
    maxVerificationAttempts: 3,
    attemptWindow: 60000,

    maxCooldownEntries: 10000,
    maxAttemptEntries: 10000,
    cooldownCleanupInterval: 300000,
    maxAuditMetadataBytes: 4096,
    maxInMemoryAuditEntries: 1000,
    logAllVerifications: true,
    keepAuditTrail: true,
  },

  // =========================
  // WELCOME / GOODBYE MESSAGES
  // =========================
  welcome: {
    // Placeholders: {user}, {server}, {memberCount}
    defaultWelcomeMessage:
      "Welcome {user} to {server}! We now have {memberCount} members!",
    defaultGoodbyeMessage:
      "{user} has left the server. We now have {memberCount} members.",
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null,
    // Role IDs given automatically on join.
    autoRoles: [],
  },

  // =========================
  // COUNTER CHANNELS
  // =========================
  counters: {
    defaults: {
      name: "{name} Counter",
      description: "Server {name} counter",
      type: "voice",
      channelName: "{name}-{count}",
    },
    permissions: {
      deny: ["VIEW_CHANNEL"],
      allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK"],
    },
    messages: {
      created: "✅ Created counter **{name}**",
      deleted: "🗑️ Deleted counter **{name}**",
      updated: "🔄 Updated counter **{name}**",
    },
    types: {
      members: {
        name: "👥 Members",
        description: "Total members in the server",
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 Bots",
        description: "Total bot accounts in the server",
        getCount: (guild) =>
          guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
      members_only: {
        name: "👤 Humans",
        description: "Total human members (non-bots)",
        getCount: (guild) =>
          guild.members.cache.filter((m) => !m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // LEVELING SYSTEM (new)
  // =========================
  leveling: {
    xpMin: 10,
    xpMax: 20,
    // Seconds between XP gains per user.
    xpCooldown: 60,
    // XP needed for next level = baseXp * level ^ exponent
    baseXp: 100,
    exponent: 1.5,
    // e.g. { "ROLE_ID": 1.5 }
    roleMultipliers: {},
    ignoredChannels: [],
    // e.g. { 5: "ROLE_ID", 10: "ROLE_ID" }
    roleRewards: {},
    levelUpMessage: "🎉 {user} reached **level {level}**!",
    // null = reply in the same channel
    levelUpChannel: null,
  },

  // =========================
  // AUTOMOD (new)
  // =========================
  automod: {
    bannedWords: [],
    antiSpam: {
      enabled: true,
      maxMessages: 5,
      interval: 5000,
      timeoutDuration: 60, // seconds
    },
    antiInvite: {
      enabled: false,
      bypassRoles: [],
    },
    antiCaps: {
      enabled: false,
      threshold: 70, // percent
      minLength: 10,
    },
    logChannel: null,
  },

  // =========================
  // STARBOARD (new)
  // =========================
  starboard: {
    emoji: "⭐",
    threshold: 3,
    channel: null,
    selfStar: false,
    ignoredChannels: [],
  },

  // =========================
  // SUGGESTIONS (new)
  // =========================
  suggestions: {
    channel: null,
    upvoteEmoji: "👍",
    downvoteEmoji: "👎",
    reviewerRoles: [],
    requireReason: false,
  },

  // =========================
  // POLLS (new)
  // =========================
  polls: {
    maxOptions: 10,
    minDuration: 60 * 1000,
    maxDuration: 7 * 24 * 60 * 60 * 1000,
    defaultDuration: 24 * 60 * 60 * 1000,
  },

  // =========================
  // GENERIC BOT MESSAGES
  // =========================
  messages: {
    noPermission: "You do not have permission to use this command.",
    cooldownActive: "Please wait {time} before using this command again.",
    errorOccurred: "An error occurred while executing this command.",
    missingPermissions:
      "I am missing required permissions to perform this action.",
    commandDisabled: "This command has been disabled.",
    maintenanceMode: "The bot is currently in maintenance mode.",
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
  // Set any feature to `false` to disable it globally.
  features: {
    economy: true,
    leveling: true,
    moderation: true,
    logging: true,
    welcome: true,

    tickets: true,
    giveaways: true,
    birthday: true,
    counter: true,

    verification: true,
    reactionRoles: true,
    joinToCreate: true,

    voice: true,
    search: true,
    tools: true,
    utility: true,
    community: true,
    fun: true,
    music: true,

    // New in Nova
    automod: true,
    starboard: true,
    suggestions: true,
    polls: true,
  },
};

// =========================
// VALIDATION
// =========================
export function validateConfig(config = botConfig) {
  const errors = [];

  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN exists:', !!process.env.TOKEN);
    logger.debug('CLIENT_ID exists:', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID exists:', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
  }

  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required (DISCORD_TOKEN or TOKEN environment variable)");
  }

  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required (CLIENT_ID environment variable)");
  }

  if (config.leveling && config.leveling.xpMin > config.leveling.xpMax) {
    errors.push("leveling.xpMin cannot be greater than leveling.xpMax");
  }

  if (process.env.NODE_ENV === 'production') {
    // A full connection URL satisfies all Postgres requirements.
    const hasConnectionUrl = Boolean(process.env.POSTGRES_URL || process.env.DATABASE_URL);

    if (!hasConnectionUrl) {
      if (!process.env.POSTGRES_HOST) {
        errors.push("PostgreSQL connection is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_HOST)");
      }
      if (!process.env.POSTGRES_USER) {
        errors.push("PostgreSQL user is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_USER)");
      }
      if (!process.env.POSTGRES_PASSWORD) {
        errors.push("PostgreSQL password is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_PASSWORD)");
      }
    }
  }

  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Bot configuration errors:", configErrors.join("\n"));
  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

export const BotConfig = botConfig;

// =========================
// HELPERS
// =========================
const COMMAND_CATEGORY_FEATURE_MAP = {
  automod: "automod",
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
  polls: "polls",
  reaction_roles: "reactionRoles",
  search: "search",
  serverstats: "counter",
  starboard: "starboard",
  suggestions: "suggestions",
  ticket: "tickets",
  tools: "tools",
  utility: "utility",
  verification: "verification",
  welcome: "welcome",
};

function normalizeCategoryKey(category) {
  return String(category || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function getCommandPrefix() {
  return botConfig.commands?.prefix ?? "!";
}

export function getBotOwners() {
  return (botConfig.commands?.owners ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);
}

export function isBotOwner(userId) {
  if (!userId) return false;
  return getBotOwners().includes(String(userId));
}

export function isMaintenanceMode() {
  return botConfig.commands?.maintenanceMode === true;
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
  if (!featureKey) return true;

  return isFeatureEnabled(featureKey);
}

// Accepts "#RRGGBB", a number, or a dot path like "suggestion.approved".
export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;

  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }

  const result = String(path)
    .split(".")
    .reduce(
      (obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback),
      botConfig.embeds.colors,
    );

  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }

  return typeof result === "number" ? result : parseInt(fallback.replace("#", ""), 16);
}

export function getApplicationStatusColor(status) {
  const colors = botConfig.applications?.statusColors || {};
  const hex = colors[status];
  return hex
    ? getColor(hex)
    : getColor(status === "approved" ? "success" : status === "denied" ? "error" : "warning");
}

export function getDefaultApplicationQuestions() {
  return (botConfig.applications?.defaultQuestions || [])
    .map((entry) => (typeof entry === "string" ? entry : entry.question))
    .filter(Boolean);
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) =>
    typeof color === "string" ? color : Object.values(color),
  );
  return colors[Math.floor(Math.random() * colors.length)];
}

// XP needed to go from `level` to `level + 1`.
export function getXpForLevel(level) {
  const { baseXp, exponent } = botConfig.leveling;
  return Math.floor(baseXp * Math.pow(level, exponent));
}

export default botConfig;

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { getColor } from '../../config/bot.js';

// =========================
// EDIT THIS SECTION
// =========================
const HOME = {
  // Direct URL to your banner image (the big "Welcome" graphic).
  // Upload it to a Discord channel and copy the link, or host it anywhere.
  bannerUrl: 'https://example.com/welcome-banner.png',

  title: 'Home',

  // {topic} is replaced by the /homepage topic option.
  intro:
    "We're so glad you found us — this is the **home base** for everything related to **{topic}**.",

  whyWeExist: [
    'To bring together people who love {topic}',
    'To share knowledge, fun, and creativity',
    'To build a safe & friendly community',
  ],

  whatYoullFind: [
    '💬 Active chats & discussions',
    '🎁 Giveaways & events',
    '📚 Helpful resources & guides',
    '🎭 Roles to personalize your experience',
  ],

  outro: 'Take the **Server Tour** to get familiar with all the key channels and features.',
  footer: 'Welcome to the community!',

  buttonLabel: 'Server Tour',
};

// Steps shown (privately) when someone clicks the Server Tour button.
// Use channel mentions like <#CHANNEL_ID> so they become clickable.
const TOUR_STEPS = [
  { name: '📜 Rules', value: 'Read the server rules: <#RULES_CHANNEL_ID>' },
  { name: '💬 Chat', value: 'Hang out and talk in <#CHAT_CHANNEL_ID>' },
  { name: '🎁 Giveaways', value: 'Win prizes in <#GIVEAWAY_CHANNEL_ID>' },
  { name: '🎭 Roles', value: 'Pick your roles in <#ROLES_CHANNEL_ID>' },
  { name: '🎫 Support', value: 'Need help? Open a ticket in <#TICKET_CHANNEL_ID>' },
];

export const HOME_TOUR_BUTTON_ID = 'home_server_tour';

// =========================
// HELPERS
// =========================
const fill = (text, topic) => text.replaceAll('{topic}', topic);

function buildHomeMessage(topic) {
  const color = getColor('primary');

  // Embed 1: banner image only
  const bannerEmbed = new EmbedBuilder()
    .setColor(color)
    .setImage(HOME.bannerUrl);

  // Embed 2: main content
  const quote = HOME.whyWeExist.map((line) => `> ${fill(line, topic)}`).join('\n');
  const found = HOME.whatYoullFind.join('\n');

  const description = [
    fill(HOME.intro, topic),
    '',
    '**Why we exist:**',
    quote,
    '',
    '**What you\'ll find here:**',
    found,
    '',
    HOME.outro,
  ].join('\n');

  const homeEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle(HOME.title)
    .setDescription(description)
    .setFooter({ text: HOME.footer });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(HOME_TOUR_BUTTON_ID)
      .setLabel(HOME.buttonLabel)
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [bannerEmbed, homeEmbed], components: [row] };
}

// =========================
// SLASH COMMAND
// =========================
export default {
  data: new SlashCommandBuilder()
    .setName('homepage')
    .setDescription('Post the server home/welcome panel in this channel')
    .addStringOption((option) =>
      option
        .setName('topic')
        .setDescription('What your server is about (e.g. gaming, art, coding)')
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const topic = interaction.options.getString('topic') ?? 'our community';

    await interaction.channel.send(buildHomeMessage(topic));

    await interaction.reply({
      content: '✅ Home panel posted!',
      flags: MessageFlags.Ephemeral,
    });
  },
};

// =========================
// BUTTON HANDLER
// =========================
// Call this from your interactionCreate event for buttons.
// Returns true if the interaction was handled.
export async function handleHomeButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== HOME_TOUR_BUTTON_ID) {
    return false;
  }

  const tourEmbed = new EmbedBuilder()
    .setColor(getColor('primary'))
    .setTitle('🧭 Server Tour')
    .setDescription('Here are the key places to get you started:')
    .addFields(TOUR_STEPS)
    .setFooter({ text: HOME.footer });

  await interaction.reply({
    embeds: [tourEmbed],
    flags: MessageFlags.Ephemeral,
  });

  return true;
}
