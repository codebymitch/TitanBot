export async function getGuildConfig(db, guildId) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false
    };

    await db.set(key, config);
  }

  return config;
}

export async function updateWelcome(db, guildId, value) {

  const key = `guild:${guildId}:config`;

  let config = await db.get(key, null);

  if (!config) {
    config = {
      guild_id: guildId,
      welcome_enabled: false
    };
  }

  config.welcome_enabled = value;

  await db.set(key, config);
}