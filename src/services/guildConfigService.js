export async function getGuildConfig(db, guildId) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,

      // 🔥 WELCOME
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "🎉 Bienvenido {user} a {server}",

      // 🔥 LOGS
      logging_enabled: false,
      log_channel: null
    };

    await db.set(key, config);
  }

  return config;
}

// 🔥 TOGGLE WELCOME
export async function updateWelcome(db, guildId, value) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "🎉 Bienvenido {user} a {server}",
      logging_enabled: false,
      log_channel: null
    };
  }

  config.welcome_enabled = value;

  await db.set(key, config);
}

// 🔥 GUARDAR CANAL WELCOME
export async function updateWelcomeChannel(db, guildId, channelId) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "🎉 Bienvenido {user} a {server}",
      logging_enabled: false,
      log_channel: null
    };
  }

  config.welcome_channel = channelId;

  await db.set(key, config);
}

// 🔥 GUARDAR MENSAJE
export async function updateWelcomeMessage(db, guildId, message) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "🎉 Bienvenido {user} a {server}",
      logging_enabled: false,
      log_channel: null
    };
  }

  config.welcome_message = message;

  await db.set(key, config);
}

// 🔥 TOGGLE LOGS
export async function updateLogging(db, guildId, value) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "🎉 Bienvenido {user} a {server}",
      logging_enabled: false,
      log_channel: null
    };
  }

  config.logging_enabled = value;

  await db.set(key, config);
}

// 🔥 GUARDAR CANAL LOGS
export async function updateLogChannel(db, guildId, channelId) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false,
      welcome_channel: null,
      welcome_message: "🎉 Bienvenido {user} a {server}",
      logging_enabled: false,
      log_channel: null
    };
  }

  config.log_channel = channelId;

  await db.set(key, config);
}