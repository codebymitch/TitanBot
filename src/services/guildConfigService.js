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