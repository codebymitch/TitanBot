const key = guildId => `community:${guildId}:config`;
export const defaults = {
  welcome: {
    enabled: false,
    channelId: null,
    message: `ברוכים הבאים ל־EditIL 🇮🇱

ברוכים הבאים {member}! 🎉

אנחנו שמחים שהצטרפתם לקהילת העריכה הישראלית.

📜 קראו את החוקים
✅ השלימו את האימות
🎭 בחרו את התפקידים שלכם
🎬 התחילו לשתף את העריכות שלכם ולהכיר את הקהילה!

תהנו ובהצלחה! 💙`
  },
  verification: { enabled: false, channelId: null, roleId: null },
  roles: { panels: [], categories: {} },
  tickets: {
    enabled: false, categoryId: null, archiveCategoryId: null, supportRoleId: null, panelChannelId: null,
    transcriptChannelId: null, logsChannelId: null, nextNumber: 1, panels: [], maxOpenPerUser: 1,
    closeDelaySeconds: 10, staffAlertCooldownSeconds: 300, maxAddedUsers: 5, allowDuplicateTypes: false,
    transcriptsEnabled: true, creatorCanClose: true, creatorCanAdd: false, creatorCanRename: false,
    pingRoleIds: [],
    claimEnabled: true, priorityEnabled: true, archiveEnabled: false, dmNotifications: true,
    enabledTypes: ['general','editing','report','partnership','bot_bug','resource','paid_work','management']
  },
  logging: { enabled: false, channelId: null, enabledEvents: {} },
  leveling: { enabled: false, announceChannelId: null, cooldownMs: 60_000, xpMin: 15, xpMax: 25 }
  , contests: { active: null, submissions: [], votes: {} }
  , channels: { suggestions: null, reports: null, feedback: null, announcements: null, selfPromotion: null, lookingForEditor: null, lookingForTeam: null }
  , staffRoles: { verified: null, newMember: null, helper: null, moderator: null, administrator: null, ticketStaff: null, booster: null, botDeveloper: null, supplier: null, botUpdates: null, friend: null }
  , modules: { moderation: true, leveling: true, welcome: true, verification: true, tickets: true, suggestions: true, reports: true, contests: true, rolePanels: true, automod: true }
  , commandSettings: {}
  , commandPermissions: {}
  , community: {
    cooldowns: { suggest: 3600, feedback: 1800, report: 900, selfpromo: 86400, lookingforeditor: 21600, lookingforteam: 21600 },
    anonymousFeedback: false, publicPolls: false, allowDiscordInvites: false, publicVoteTotals: true,
    enabled: true, editingRoleIds: []
  }
};
export async function getConfig(client, guildId) {
  const saved = await client.db.get(key(guildId), {});
  return { ...defaults, ...saved, welcome: { ...defaults.welcome, ...saved.welcome }, verification: { ...defaults.verification, ...saved.verification }, roles: { ...defaults.roles, ...saved.roles, categories: { ...defaults.roles.categories, ...saved.roles?.categories } }, tickets: { ...defaults.tickets, ...saved.tickets }, logging: { ...defaults.logging, ...saved.logging }, leveling: { ...defaults.leveling, ...saved.leveling }, contests: { ...defaults.contests, ...saved.contests }, channels: { ...defaults.channels, ...saved.channels }, staffRoles: { ...defaults.staffRoles, ...saved.staffRoles }, modules: { ...defaults.modules, ...saved.modules }, commandSettings: { ...defaults.commandSettings, ...saved.commandSettings }, commandPermissions: { ...defaults.commandPermissions, ...saved.commandPermissions }, community: { ...defaults.community, ...saved.community, cooldowns: { ...defaults.community.cooldowns, ...saved.community?.cooldowns } } };
}
export async function updateConfig(client, guildId, patch) {
  const current = await getConfig(client, guildId);
  const next = { ...current, ...patch };
  for (const name of ['welcome', 'verification', 'roles', 'tickets', 'logging', 'leveling', 'contests', 'channels', 'staffRoles', 'modules', 'commandSettings', 'commandPermissions', 'community']) next[name] = { ...current[name], ...(patch[name] || {}) };
  next.community.cooldowns = { ...current.community.cooldowns, ...(patch.community?.cooldowns || {}) };
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
