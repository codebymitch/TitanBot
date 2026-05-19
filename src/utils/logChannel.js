/**
 * Resolve the channel a log embed should be sent to.
 *
 * Prefers the per-category channel (config.logs.categories[categoryKey])
 * and falls back to the single audit channel (config.logs.channel).
 * Returns null if neither resolves, so callers can simply `return`.
 *
 * Valid category keys (config.logs.categories): message, member,
 * moderation, voice, role, channel. Events without a dedicated category
 * channel should pass null and will use the main audit channel.
 *
 * @param {import('discord.js').Guild} guild
 * @param {object} config - guild config from guildConfigService
 * @param {string|null} categoryKey
 * @returns {Promise<import('discord.js').TextBasedChannel|null>}
 */
export async function resolveLogChannel(guild, config, categoryKey = null) {
  if (!guild || !config?.logs) return null;

  const fetchChannel = async (id) => {
    if (!id) return null;
    return (
      guild.channels.cache.get(id) ||
      (await guild.channels.fetch(id).catch(() => null))
    );
  };

  let channel = null;

  if (categoryKey && config.logs.categories?.[categoryKey]) {
    channel = await fetchChannel(config.logs.categories[categoryKey]);
  }

  if (!channel && config.logs.channel) {
    channel = await fetchChannel(config.logs.channel);
  }

  return channel;
}

const CHANNEL_TYPE_NAMES = {
  0: 'Texto',
  2: 'Voz',
  4: 'Categoría',
  5: 'Anuncios',
  10: 'Hilo de anuncio',
  11: 'Hilo público',
  12: 'Hilo privado',
  13: 'Escenario',
  14: 'Directorio',
  15: 'Foro',
  16: 'Media',
};

/**
 * Human-readable channel type label from a ChannelType enum value.
 */
export function channelTypeName(type) {
  return CHANNEL_TYPE_NAMES[type] ?? `Tipo ${type}`;
}

