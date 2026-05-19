const DEFAULT_CONFIG = {

  guild_id: null,

  // 🌎 LANGUAGE
  language: 'es',

  // 🔥 WELCOME
  welcome: {
    enabled: false,
    channel: null,
    message: '🎉 Bienvenido {user} a {server}'
  },

  // 📊 ADVANCED LOGS
  logs: {

    enabled: false,

    mode: 'single',

    channel: null,

    // per-category / per-event enable map. Absent or true = enabled.
    // Keys: 'member.*', 'role.update', 'message.delete', ...
    enabledEvents: {},

    categories: {

      message: null,
      member: null,
      moderation: null,
      voice: null,
      role: null,
      channel: null

    }

  }

};

// ========================================
// 🔥 GET CONFIG
// ========================================

export async function getGuildConfig(db, guildId) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {

    config = {
      ...DEFAULT_CONFIG,
      guild_id: guildId
    };

    await db.set(key, config);

  }

  let updated = false;

  // 🌎 LANGUAGE
  if (!config.language) {
    config.language = 'es';
    updated = true;
  }

  // 🔥 WELCOME
  if (!config.welcome) {

    config.welcome = {

      enabled: config.welcome_enabled || false,
      channel: config.welcome_channel || null,
      message: config.welcome_message || '🎉 Bienvenido {user} a {server}'

    };

    updated = true;

  }

  // ========================================
  // 📊 LOGS
  // ========================================

  if (!config.logs) {

    config.logs = {

      enabled: config.logging_enabled || false,
      mode: 'single',
      channel: config.log_channel || null,

      categories: {

        message: null,
        member: null,
        moderation: null,
        voice: null,
        role: null,
        channel: null

      }

    };

    updated = true;

  }

  if (!config.logs.mode) {
    config.logs.mode = 'single';
    updated = true;
  }

  if (!config.logs.categories) {

    config.logs.categories = {

      message: null,
      member: null,
      moderation: null,
      voice: null,
      role: null,
      channel: null

    };

    updated = true;

  }

  if (!config.logs.enabledEvents || typeof config.logs.enabledEvents !== 'object') {
    config.logs.enabledEvents = {};
    updated = true;
  }

  // 🔄 MIGRATION: the dashboard / older /logging setchannel wrote the log
  // channel under config.logging.channelId or config.logChannelId, but the
  // event handlers only read config.logs.channel. Back-fill it once so
  // already-configured servers keep working without re-running setchannel.
  if (!config.logs.channel) {

    const legacyChannel =
      config.logging?.channelId ||
      config.logChannelId ||
      null;

    if (legacyChannel) {

      config.logs.channel = legacyChannel;

      if (
        config.logging?.enabled === true ||
        config.enableLogging === true
      ) {
        config.logs.enabled = true;
      }

      updated = true;

    }

  }

  if (updated) {
    await db.set(key, config);
  }

  return config;
}

// ========================================
// 🔥 WELCOME
// ========================================

export async function updateWelcome(db, guildId, value) {

  const config = await getGuildConfig(db, guildId);

  config.welcome.enabled = value;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

export async function updateWelcomeChannel(db, guildId, channelId) {

  const config = await getGuildConfig(db, guildId);

  config.welcome.channel = channelId;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

export async function updateWelcomeMessage(db, guildId, message) {

  const config = await getGuildConfig(db, guildId);

  config.welcome.message = message;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

// ========================================
// 📊 LOGS
// ========================================

export async function updateLogging(db, guildId, value) {

  const config = await getGuildConfig(db, guildId);

  config.logs.enabled = value;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

// 🔥 SINGLE CHANNEL

export async function updateLogChannel(db, guildId, channelId) {

  const config = await getGuildConfig(db, guildId);

  config.logs.channel = channelId;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

// 🔥 FIXED MODE (AQUÍ ESTABA EL BUG)

export async function updateLogMode(db, guildId, mode) {

  const config = await getGuildConfig(db, guildId);

  // 🔥 NORMALIZAR (ESTO ARREGLA TODO)
  if (
    mode === 'advanced' ||
    mode === 'Advanced Categories'
  ) {

    config.logs.mode = 'advanced';

  } else {

    config.logs.mode = 'single';

  }

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

// 🔥 CATEGORY

export async function updateLogCategory(db, guildId, category, channelId) {

  const config = await getGuildConfig(db, guildId);

  if (!config.logs.categories) {
    config.logs.categories = {};
  }

  config.logs.categories[category] = channelId;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

// ========================================
// 🌎 LANGUAGE
// ========================================

export async function updateLanguage(db, guildId, language) {

  const config = await getGuildConfig(db, guildId);

  config.language = language;

  await db.set(`guild:${guildId}:config`, config);

  return config;
}

// ========================================
// 🧩 GENERIC PATCH (used by the web settings panels)
// ========================================

/**
 * Merge a partial config into the single guild config document.
 * Top-level scalars are replaced; known nested objects (welcome,
 * leveling, logs) are shallow-merged so unrelated fields survive.
 */
export async function patchGuildConfig(db, guildId, patch = {}) {
  const config = await getGuildConfig(db, guildId);

  for (const [key, value] of Object.entries(patch)) {
    const isPlainObject =
      value && typeof value === 'object' && !Array.isArray(value);

    if (isPlainObject && config[key] && typeof config[key] === 'object') {
      config[key] = { ...config[key], ...value };
    } else {
      config[key] = value;
    }
  }

  await db.set(`guild:${guildId}:config`, config);
  return config;
}