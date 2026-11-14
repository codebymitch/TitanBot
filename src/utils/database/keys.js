/**
 * Canonical database key registry.
 * All storage keys should be built through these helpers.
 */

export const getGuildConfigKey = (guildId) => `guild:${guildId}:config`;
