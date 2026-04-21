import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE (what users see under the bot name)
  // =========================
  presence: {
    status: "online",
    activities: [
      {
        name: "Made with ❤️",
        type: 0, 
      },
    ],
  },

  // =========================
  // COMMAND BEHAVIOR
  // =========================
  commands: {
    owners: process.env.OWNER_IDS?.split(",") || [],
    defaultCooldown: 3, 
    deleteCommands: false,
    testGuildId: process.env.TEST_GUILD_ID,
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
    applicationCooldown: 24, 
    deleteDeniedAfter: 7, 
    deleteApprovedAfter: 30, 
    managerRoles: [],
  },

  // =========================
  // EMBED COLORS & BRANDING
  // =========================
  embeds: {
    colors: {
      primary: "#336699", 
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
    },
    footer: {
      text: "Titan Bot",
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
  // MUSIC & VOICE SETTINGS (24/7 Mode)
  // =========================
  music: {
    // يجعل البوت يبقى في الروم الصوتي دائماً
    stayInVoiceChannel: true, 
    // هل يخرج إذا كان الروم فارغاً؟ (false = سيبقى)
    leaveOnEmpty: false,
    // هل يخرج عند انتهاء قائمة التشغيل؟ (false = سيبقى)
    leaveOnEnd: false,
    // هل يخرج إذا تم إيقاف الموسيقى يدوياً؟
    leaveOnStop: false,
    // لتفعيل خاصية الـ 24/7 برمجياً
    twentyFourSeven: true,
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
    robSuccessRate: 0.4,
    robFailJailTime: 3600000, 
  },

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
    defaultDuration: 86400000, 
    minimumWinners: 1,
    maximumWinners: 10,
    minimumDuration: 300000, 
    maximumDuration: 2592000000, 
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
    defaultMessage: "Click the button below to verify yourself!",
    defaultButtonText: "Verify",
    autoVerify: {
      defaultCriteria: "none",
      defaultAccountAgeDays: 7,
      serverSizeThreshold: 1000,
      minAccountAge: 1,      
      maxAccountAge: 365,      
      sendDMNotification: true,
      criteria: {
        account_age: "Account must be older than specified days",
        server_size: "All users if server has less than 1000 members",
        none: "All users immediately"
      }
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
    defaultWelcomeMessage: "Welcome {user} to {server}!",
    defaultGoodbyeMessage: "{user} has left the server.",
    defaultWelcomeChannel: null,
    defaultGoodbyeChannel: null,
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
        getCount: (guild) => guild.memberCount.toString(),
      },
      bots: {
        name: "🤖 Bots",
        getCount: (guild) => guild.members.cache.filter((m) => m.user.bot).size.toString(),
      },
    },
  },

  // =========================
  // GENERIC BOT MESSAGES
  // =========================
  messages: {
    noPermission: "You do not have permission to use this command.",
    cooldownActive: "Please wait {time} before using this command again.",
    errorOccurred: "An error occurred while executing this command.",
    missingPermissions: "I am missing required permissions.",
    commandDisabled: "This command has been disabled.",
    maintenanceMode: "The bot is currently in maintenance mode.",
  },

  // =========================
  // FEATURE TOGGLES
  // =========================
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
  },
};

export function validateConfig(config) {
  const errors = [];
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
  }
  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required");
  }
  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required");
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

export function getColor(path, fallback = "#99AAB5") {
  if (typeof path === "number") return path;
  if (typeof path === "string" && path.startsWith("#")) {
    return parseInt(path.replace("#", ""), 16);
  }
  const result = path.split(".").reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback), botConfig.embeds.colors);
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  return result;
}

export function getRandomColor() {
  const colors = Object.values(botConfig.embeds.colors).flatMap((color) => typeof color === "string" ? color : Object.values(color));
  return colors[Math.floor(Math.random() * colors.length)];
}

export default botConfig;
