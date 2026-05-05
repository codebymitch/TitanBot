export async function getGuildConfig(db, guildId) {
  const res = await db.query(
    'SELECT * FROM guild_config WHERE guild_id = $1',
    [guildId]
  );

  // 🧠 Si no existe → lo crea automáticamente
  if (res.rows.length === 0) {
    await db.query(
      `INSERT INTO guild_config (guild_id, welcome_enabled)
       VALUES ($1, false)`,
      [guildId]
    );

    return {
      guild_id: guildId,
      welcome_enabled: false,
      log_channel: null
    };
  }

  return res.rows[0];
}

export async function updateWelcome(db, guildId, value) {
  // 🔥 UPSERT (por si acaso)
  await db.query(
    `INSERT INTO guild_config (guild_id, welcome_enabled)
     VALUES ($1, $2)
     ON CONFLICT (guild_id)
     DO UPDATE SET welcome_enabled = EXCLUDED.welcome_enabled`,
    [guildId, value]
  );
}