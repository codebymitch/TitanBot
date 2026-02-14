import { fileURLToPath } from "url";
import path from "path";
import botConfig, { validateConfig } from "./bot.js";
import { shopConfig as shop } from "./shop/index.js";
import { pgConfig } from "./postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main application configuration object
 * Combines environment variables, bot config, and other settings
 * Centralizes all application-wide settings for TitanBot
 */
const appConfig = {
  paths: {
    root: path.join(__dirname, "../.."),
    commands: path.join(__dirname, "../commands"),
    events: path.join(__dirname, "../events"),
    config: __dirname,
    utils: path.join(__dirname, "../utils"),
    services: path.join(__dirname, "../services"),
    handlers: path.join(__dirname, "../handlers"),
    interactions: path.join(__dirname, "../interactions"),
  },

  bot: {
    ...botConfig,
    token: process.env.DISCORD_TOKEN || process.env.TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,

    shop: {
      ...botConfig.shop,
      ...shop,
    },
  },

  // PostgreSQL configuration - Primary production database
  postgresql: {
    ...pgConfig,
  },

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

  api: {
    port: process.env.PORT || 3000,
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
  },

  shop,

  /**
   * Comprehensive feature toggles for all bot systems
   * Matches commands in src/commands/ directories
   * Enables/disables entire feature systems
   */
  features: {
    // Core systems
    economy: true,                  // Economy system (balance, shop, currency)
    leveling: true,                 // XP and leveling system
    moderation: true,               // Ban, kick, warn, etc.
    logging: true,                  // Event logging and audit trail
    welcome: true,                  // Member welcome messages

    // Interactive systems
    tickets: true,                  // Support ticket system
    giveaways: true,                // Giveaway creation and management
    birthday: true,                 // Birthday tracking and announcements
    counter: true,                  // Custom server counters

    // Advanced features
    verification: true,             // Member verification system
    reactionRoles: true,            // Reaction role assignments
    joinToCreate: true,             // Dynamic voice channel creation

    // Utility & Communication
    voice: true,                    // Voice channel utilities
    search: true,                   // Search functionality
    tools: true,                    // General tools and utilities
    utility: true,                  // Utility commands
    community: true,                // Community management commands
    fun: true,                      // Fun and entertainment commands

    // Legacy/Disabled
    music: false,                   // Music playback (not implemented)
  },

  env: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV !== "production",
};

Object.freeze(appConfig);

export default appConfig;
