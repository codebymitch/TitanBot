import { fileURLToPath } from "url";
import path from "path";
import botConfig, { validateConfig } from "./bot.js";
import { shopConfig as shop } from "./shop/index.js";
import { pgConfig } from "./database/postgres.js";
import { getEnv } from "./env.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const env = getEnv();

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
    token: env.DISCORD_TOKEN || env.TOKEN,
    clientId: env.CLIENT_ID,
    // Retained for tutorial/setup compatibility; not used for command registration.
    guildId: env.GUILD_ID,

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
    level: env.LOG_LEVEL || "info",
    file: {
      enabled: env.LOG_TO_FILE === "true",
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
      enabled: env.SENTRY_DSN ? true : false,
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV || "development",
    },
  },

  api: {
    port: env.PORT || 3000,
    cors: {
      origin: env.CORS_ORIGIN?.split(",") || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      max: 100,
    },
  },

  shop,

  features: {
    ...botConfig.features,
    music: botConfig.features?.music ?? true,
  },

  env: env.NODE_ENV || "development",
  isProduction: env.NODE_ENV === "production",
  isDevelopment: env.NODE_ENV !== "production",
};

Object.freeze(appConfig);

export default appConfig;