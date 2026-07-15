const key = guildId => `community:${guildId}:config`;
export const defaults = {
  welcome: { enabled: false, channelId: null, message: 'ברוך הבא {user} לשרת {server}!' },
  verification: { enabled: false, channelId: null, roleId: null },
  roles: { panels: [] },
  tickets: { enabled: false, categoryId: null, supportRoleId: null, panelChannelId: null, nextNumber: 1 },
  logging: { enabled: false, channelId: null },
  leveling: { enabled: false, announceChannelId: null, cooldownMs: 60_000, xpMin: 15, xpMax: 25 }
  , contests: { active: null, submissions: [], votes: {} }
  , channels: { suggestions: null, reports: null, feedback: null, announcements: null }
  , commandPermissions: {}
};
export async function getConfig(client, guildId) {
  const saved = await client.db.get(key(guildId), {});
  return { ...defaults, ...saved, welcome: { ...defaults.welcome, ...saved.welcome }, verification: { ...defaults.verification, ...saved.verification }, roles: { ...defaults.roles, ...saved.roles }, tickets: { ...defaults.tickets, ...saved.tickets }, logging: { ...defaults.logging, ...saved.logging }, leveling: { ...defaults.leveling, ...saved.leveling }, contests: { ...defaults.contests, ...saved.contests }, channels: { ...defaults.channels, ...saved.channels }, commandPermissions: { ...defaults.commandPermissions, ...saved.commandPermissions } };
}
export async function updateConfig(client, guildId, patch) {
  const current = await getConfig(client, guildId);
  const next = { ...current, ...patch };
  for (const name of ['welcome', 'verification', 'roles', 'tickets', 'logging', 'leveling', 'contests', 'channels', 'commandPermissions']) next[name] = { ...current[name], ...(patch[name] || {}) };
  await client.db.set(key(guildId), next);
  return next;
}
export async function resetConfig(client, guildId) {
  await client.db.set(key(guildId), structuredClone(defaults));
  return getConfig(client, guildId);
}
export const levelKey = (guildId, userId) => `community:${guildId}:level:${userId}`;
export const ticketKey = (guildId, channelId) => `community:${guildId}:ticket:${channelId}`;
export const warningKey = (guildId, userId) => `community:${guildId}:warnings:${userId}`;
