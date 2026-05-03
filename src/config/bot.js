import { logger } from '../utils/logger.js';

export const botConfig = {
  // =========================
  // BOT PRESENCE
  // =========================
  presence: {
    status: "online",
    activities: [
      {
        name: "Grow a Garden Market | /myboot",
        type: 3, // 3 = Watching
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
  // EMBED COLORS & BRANDING
  // =========================
  embeds: {
    colors: {
      primary: "#2ecc71", // Garden Green
      secondary: "#e67e22", // Clay Pot Orange
      success: "#57F287", 
      error: "#ED4245", 
      warning: "#FEE75C", 
      info: "#3498DB", 
      economy: "#F1C40F",
    },
    footer: {
      text: "Grow a Garden Trading Bot",
      icon: null,
    },
    thumbnail: "https://static.wikia.nocookie.net/grow-a-garden/images/8/8e/Site-logo.png", // Wiki Logo
  },

  // =========================
  // MARKET & ECONOMY SETTINGS
  // =========================
  economy: {
    currency: {
      name: "Coins",
      namePlural: "Coins",
      symbol: "💰",
    },
    startingBalance: 100,
    dailyAmount: 50,
    
    // Custom Market Settings
    market: {
        maxItemsPerBoot: 10,
        wikiBaseUrl: "https://grow-a-garden.fandom.com/wiki/",
    }
  },

  // =========================
  // GENERIC BOT MESSAGES
  // =========================
  messages: {
    noPermission: "Wala kang permiso para gamitin ito.",
    cooldownActive: "Wait ka muna ng {time} bago mag-check ulit ng boot.",
    errorOccurred: "May error sa pag-load ng market data.",
    maintenanceMode: "Nagdidilig lang kami ng mga halaman (Maintenance).",
  },

  // =========================
  // FEATURE TOGGLES (Naka-OFF ang mga hindi kailangan)
  // =========================
  features: {
    economy: true,
    utility: true,
    fun: true,
    leveling: false,
    moderation: true,
    logging: true,
    welcome: true,
    tickets: false,    // OFF
    giveaways: false,  // OFF
    birthday: false,   // OFF
    counter: false,    // OFF
    verification: false, // OFF
    reactionRoles: false,
    joinToCreate: false,
  },
};

export function validateConfig(config) {
  const errors = [];
  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
    errors.push("Bot token is required!");
  }
  if (!process.env.CLIENT_ID) {
    errors.push("Client ID is required!");
  }
  return errors;
}

const configErrors = validateConfig(botConfig);
if (configErrors.length > 0) {
  logger.error("Bot configuration errors:", configErrors.join("\n"));
}

export const BotConfig = botConfig;

export function getColor(path, fallback = "#2ecc71") {
  if (typeof path === "number") return path;
  const result = path.split(".").reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : fallback), botConfig.embeds.colors);
  if (typeof result === "string" && result.startsWith("#")) {
    return parseInt(result.replace("#", ""), 16);
  }
  return result;
}

export default botConfig;
