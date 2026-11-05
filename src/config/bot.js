import { logger } from '../utils/logger.js';

export const botConfig = {
  presence: { status: 'online', activities: [{ name: 'Custom Status', state: 'Milano Roleplay', type: 4 }] },
  commands: {
    owners: process.env.OWNER_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || [],
    defaultCooldown: 3, deleteCommands: false, testGuildId: process.env.TEST_GUILD_ID,
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true', prefix: process.env.PREFIX || '!',
  },
  applications: {
    defaultQuestions: [{ question: 'What is your name?', required: true }, { question: 'How old are you?', required: true }, { question: 'Why do you want to join?', required: true }],
    statusColors: { pending: '#FFA500', approved: '#00FF00', denied: '#FF0000' }, applicationCooldown: 24,
    deleteDeniedAfter: 7, deleteApprovedAfter: 30, managerRoles: [],
  },
  embeds: {
    colors: {
      primary: '#336699', secondary: '#2F3136', success: '#57F287', error: '#ED4245', warning: '#FEE75C', info: '#3498DB',
      light: '#FFFFFF', dark: '#202225', gray: '#99AAB5', blurple: '#5865F2', green: '#57F287', yellow: '#FEE75C',
      fuchsia: '#EB459E', red: '#ED4245', black: '#000000', giveaway: { active: '#57F287', ended: '#ED4245' },
      ticket: { open: '#57F287', claimed: '#FAA61A', closed: '#ED4245', pending: '#99AAB5' }, birthday: '#E91E63', moderation: '#9B59B6',
      priority: { none: '#95A5A6', low: '#3498db', medium: '#2ecc71', high: '#f1c40f', urgent: '#e74c3c' },
    },
    footer: { text: 'Titan Bot', icon: null }, thumbnail: null, author: { name: null, icon: null, url: null },
  },
  tickets: {
    defaultCategory: null, supportRoles: [],
    priorities: { none: { emoji: '⚪', color: '#95A5A6', label: 'None' }, low: { emoji: '🟢', color: '#2ECC71', label: 'Low' }, medium: { emoji: '🟡', color: '#F1C40F', label: 'Medium' }, high: { emoji: '🔴', color: '#E74C3C', label: 'High' }, urgent: { emoji: '🚨', color: '#E91E63', label: 'Urgent' } },
    defaultPriority: 'none', archiveCategory: null, logChannel: null,
  },
  giveaways: { defaultDuration: 86400000, minimumWinners: 1, maximumWinners: 10, minimumDuration: 300000, maximumDuration: 2592000000, allowedRoles: [], bypassRoles: [] },
  birthday: { defaultRole: null, announcementChannel: null, timezone: 'UTC' },
  verification: {
    defaultMessage: 'Click the button below to verify yourself and gain access to the server!', defaultButtonText: 'Verify',
    autoVerify: { defaultCriteria: 'none', defaultAccountAgeDays: 7, serverSizeThreshold: 1000, minAccountAge: 1, maxAccountAge: 365, sendDMNotification: true, criteria: { account_age: 'Account must be older than specified days', server_size: 'All users if server has less than 1000 members', none: 'All users immediately' } },
    verificationCooldown: 5000, maxVerificationAttempts: 3, attemptWindow: 60000, maxCooldownEntries: 10000, maxAttemptEntries: 10000,
    cooldownCleanupInterval: 300000, maxAuditMetadataBytes: 4096, maxInMemoryAuditEntries: 1000, logAllVerifications: true, keepAuditTrail: true,
  },
  welcome: { defaultWelcomeMessage: 'Welcome {user} to {server}! We now have {memberCount} members!', defaultGoodbyeMessage: '{user} has left the server. We now have {memberCount} members.', defaultWelcomeChannel: null, defaultGoodbyeChannel: null },
  counters: {
    defaults: { name: '{name} Counter', description: 'Server {name} counter', type: 'voice', channelName: '{name}-{count}' },
    permissions: { deny: ['VIEW_CHANNEL'], allow: ['VIEW_CHANNEL', 'CONNECT', 'SPEAK'] },
    messages: { created: '✅ Created counter **{name}**', deleted: '🗑️ Deleted counter **{name}**', updated: '🔄 Updated counter **{name}**' },
    types: {
      members: { name: '👥 Members', description: 'Total members in the server', getCount: (guild) => guild.memberCount.toString() },
      bots: { name: '🤖 Bots', description: 'Total bot accounts in the server', getCount: (guild) => guild.members.cache.filter((m) => m.user.bot).size.toString() },
      members_only: { name: '👤 Humans', description: 'Total human members (non-bots)', getCount: (guild) => guild.members.cache.filter((m) => !m.user.bot).size.toString() },
    },
  },
  messages: { noPermission: 'You do not have permission to use this command.', cooldownActive: 'Please wait {time} before using this command again.', errorOccurred: 'An error occurred while executing this command.', missingPermissions: 'I am missing required permissions to perform this action.', commandDisabled: 'This command has been disabled.', maintenanceMode: 'The bot is currently in maintenance mode.' },
  features: { leveling: true, moderation: true, logging: true, welcome: true, tickets: true, giveaways: true, birthday: true, counter: true, verification: true, reactionRoles: true, search: true, tools: true, utility: true, community: true },
};

export function validateConfig() {
  const errors = [];
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('Environment variables check:');
    logger.debug('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
    logger.debug('TOKEN exists:', !!process.env.TOKEN);
    logger.debug('CLIENT_ID exists:', !!process.env.CLIENT_ID);
    logger.debug('GUILD_ID exists:', !!process.env.GUILD_ID);
    logger.debug('POSTGRES_HOST exists:', !!process.env.POSTGRES_HOST);
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
  }
  if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) errors.push('Bot token is required (DISCORD_TOKEN or TOKEN environment variable)');
  if (!process.env.CLIENT_ID) errors.push('Client ID is required (CLIENT_ID environment variable)');
  if (process.env.NODE_ENV === 'production' && !process.env.POSTGRES_URL && !process.env.DATABASE_URL) {
    if (!process.env.POSTGRES_HOST) errors.push('PostgreSQL connection is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_HOST)');
    if (!process.env.POSTGRES_USER) errors.push('PostgreSQL user is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_USER)');
    if (!process.env.POSTGRES_PASSWORD) errors.push('PostgreSQL password is required in production (set DATABASE_URL/POSTGRES_URL, or POSTGRES_PASSWORD)');
  }
  return errors;
}
const configErrors = validateConfig(botConfig);
if (configErrors.length && process.env.NODE_ENV === 'production') { logger.error('Bot configuration errors:', errors.join('\n')); process.exit(1); }
export const BotConfig = botConfig;
const COMMAND_CATEGORY_FEATURE_MAP = { birthday: 'birthday', community: 'community', giveaway: 'giveaways', leveling: 'leveling', logging: 'logging', moderation: 'moderation', reaction_roles: 'reactionRoles', search: 'search', serverstats: 'counter', ticket: 'tickets', tools: 'tools', utility: 'utility', verification: 'verification', welcome: 'welcome' };
function normalizeCategoryKey(category) { return String(category || '').trim().toLowerCase().replace(/\s+/g, '_'); }
export function getCommandPrefix() { return botConfig.commands?.prefix ?? '!'; }
export function getBotOwners() { return (botConfig.commands?.owners ?? []).map((id) => String(id).trim()).filter(Boolean); }
export function isBotOwner(userId) { return !!userId && getBotOwners().includes(String(userId)); }
export function isMaintenanceMode() { return botConfig.commands?.maintenanceMode === true; }
export function getBotMessage(key, replacements = {}) { let message = botConfig.messages?.[key] || key; for (const [keyName, value] of Object.entries(replacements)) message = message.replace(new RegExp(`\\{${keyName}\\}`, 'g'), String(value)); return message; }
export function isFeatureEnabled(key) { return !key || botConfig.features?.[key] !== false; }
export function isCommandCategoryEnabled(category) { const normalized = normalizeCategoryKey(category); if (!normalized || normalized === 'core') return true; const feature = COMMAND_CATEGORY_FEATURE_MAP[normalized]; return !feature || isFeatureEnabled(feature); }
export function getApplicationStatusColor(status) { const hex = botConfig.applications?.statusColors?.[status]; return hex ? getColor(hex) : getColor(status === 'approved' ? 'success' : status === 'denied' ? 'error' : 'warning'); }
export function getDefaultApplicationQuestions() { return (botConfig.applications?.defaultQuestions || []).map((item) => typeof item === 'string' ? item : item.question).filter(Boolean); }
export function getColor(path, fallback = '#99AAB5') { if (typeof path === 'number') return path; if (typeof path === 'string' && path.startsWith('#')) return parseInt(path.slice(1), 16); const result = String(path).split('.').reduce((value, key) => value?.[key] ?? fallback, botConfig.embeds.colors); return typeof result === 'string' && result.startsWith('#') ? parseInt(result.slice(1), 16) : result; }
export function getRandomColor() { const colors = Object.values(botConfig.embeds.colors).flatMap((color) => typeof color === 'string' ? color : Object.values(color)); return colors[Math.floor(Math.random() * colors.length)]; }
export default botConfig;
