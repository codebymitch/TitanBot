import { fileURLToPath } from "url";
import path from "path";
import botConfig, { validateConfig } from "./bot.js";
import { shopConfig as shop } from "./shop/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main configuration object for the application
 * Combines environment variables, bot config, and other settings
 */
const config = {
  // Paths
  paths: {
    root: path.join(__dirname, "../.."),
    commands: path.join(__dirname, "../src/commands"),
    events: path.join(__dirname, "../events"),
    config: __dirname,
    utils: path.join(__dirname, "../utils"),
    services: path.join(__dirname, "../services"),
    models: path.join(__dirname, "../models"),
  },

  // Bot configuration
  bot: {
    ...botConfig,
    // Core bot settings
    token: process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    // Shop configuration
    shop: {
      ...botConfig.shop,
      ...shop,
    },

    // Merge with any additional bot config
    ...botConfig,
  },

  // Database configuration
  database: {
    url: process.env.DATABASE_URL || "replit",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 10000,
      retryWrites: true,
      w: "majority",
    },

    // Collections/table names
    collections: {
      users: "users",
      guilds: "guilds",
      economy: "economy",
      shop: "shop",
      tickets: "tickets",
      moderation: "moderation",
      leveling: "leveling",
      giveaways: "giveaways",
    },
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || "info",
    file: {
      enabled: process.env.LOG_TO_FILE === "true",
      path: path.join(__dirname, "../../logs"),
      maxSize: "20m",
      maxFiles: "14d",
      zippedArchive: true,
    },
    console: {
      enabled: true,
      colorize: true,
      timestamp: true,
    },
    sentry: {
      enabled: process.env.SENTRY_DSN ? true : false,
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
    },
  },

  // API and external services
  api: {
    port: process.env.PORT || 3000,
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },

  // Shop configuration
  shop,

  // Feature toggles
  features: {
    economy: true,
    leveling: true,
    moderation: true,
    tickets: true,
    giveaways: true,
    music: false,
    welcome: true,
    logging: true,
  },

  // Environment
  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",
};

// Freeze the config to prevent accidental modifications
Object.freeze(config);

export default config;
