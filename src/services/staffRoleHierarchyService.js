import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { logger } from '../utils/logger.js';
import { findBoardMessage, rememberBoardMessage } from '../utils/boardMessage.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import { isHomeGuild } from '../config/homeGuild.js';

const ROLE_PERMISSIONS_CHANNEL_ID = '1550598605382099044';
const PERMISSION_BOARD_FOOTER = 'Staff permissions • Anti-Raid / Anti-Nuke administration';

const PERMISSION_LABELS = new Map([
  [PermissionFlagsBits.Administrator, 'Administrator — إدارة كاملة'],
  [PermissionFlagsBits.ViewAuditLog, 'View Audit Log — مشاهدة سجل التدقيق'],
  [PermissionFlagsBits.ManageGuild, 'Manage Server — إدارة السيرفر'],
  [PermissionFlagsBits.ManageChannels, 'Manage Channels — إدارة الرومات'],
  [PermissionFlagsBits.ManageRoles, 'Manage Roles — إدارة الرتب'],
  [PermissionFlagsBits.ManageWebhooks, 'Manage Webhooks — إدارة الويب هوكس'],
  [PermissionFlagsBits.ManageMessages, 'Manage Messages — إدارة الرسائل'],
  [PermissionFlagsBits.ManageNicknames, 'Manage Nicknames — إدارة الأسماء'],
  [PermissionFlagsBits.KickMembers, 'Kick Members — طرد الأعضاء'],
  [PermissionFlagsBits.BanMembers, 'Ban Members — حظر الأعضاء'],
  [PermissionFlagsBits.ModerateMembers, 'Moderate Members — تايم أوت'],
  [PermissionFlagsBits.ViewChannel, 'View Channels — مشاهدة الرومات'],
  [PermissionFlagsBits.SendMessages, 'Send Messages — إرسال الرسائل'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History — قراءة سجل الرسائل'],
  [PermissionFlagsBits.Connect, 'Connect — دخول الصوت'],
  [PermissionFlagsBits.Speak, 'Speak — التحدث بالصوت'],
  [PermissionFlagsBits.MoveMembers, 'Move Members — سحب ونقل من الفويس'],
  [PermissionFlagsBits.MuteMembers, 'Mute Members — ميوت بالفويس'],
  [PermissionFlagsBits.DeafenMembers, 'Deafen Members — ديفن بالفويس'],
  [PermissionFlagsBits.ManageThreads, 'Manage Threads — إدارة الثريدات'],
  [PermissionFlagsBits.ManageEvents, 'Manage Events — إدارة الفعاليات'],
  [PermissionFlagsBits.MentionEveryone, 'Mention Everyone — منشن الجميع'],
  [PermissionFlagsBits.SendMessagesInThreads, 'Send Messages in Threads — الكتابة في الثريدات'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links — إرسال الروابط'],
  [PermissionFlagsBits.AttachFiles, 'Attach Files — إرسال الملفات'],
  [PermissionFlagsBits.AddReactions, 'Add Reactions — الرياكشن'],
  [PermissionFlagsBits.UseExternalEmojis, 'Use External Emojis — إيموجي خارجي'],
  [PermissionFlagsBits.PinMessages, 'Pin Messages — تثبيت الرسائل'],
  [PermissionFlagsBits.Stream, 'Video / Stream — الكاميرا والشير'],
  [PermissionFlagsBits.UseVAD, 'Voice Activity — التحدث بدون ضغط زر'],
  [PermissionFlagsBits.PrioritySpeaker, 'Priority Speaker — أولوية التحدث'],
  [PermissionFlagsBits.RequestToSpeak, 'Request to Speak — طلب التحدث في الستيدج'],
  [PermissionFlagsBits.UseSoundboard, 'Use Soundboard — الساوند بورد'],
  [PermissionFlagsBits.UseExternalSounds, 'Use External Sounds — أصوات خارجية'],
  [PermissionFlagsBits.UseEmbeddedActivities, 'Use Activities — الأنشطة في الفويس'],
]);

// Every permission except Administrator: 🔨 Moderator can do everything without being an administrator.
const ALL_EXCEPT_ADMINISTRATOR = new PermissionsBitField(PermissionsBitField.All).remove(PermissionFlagsBits.Administrator).bitfield;

const BASE_PERMISSIONS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];

// Chat moderation: timeout/mute and /warn (ModerateMembers), /usernotes and message cleanup (ManageMessages), /cases (ViewAuditLog).
const CHAT_MODERATOR_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.PinMessages,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.UseExternalEmojis,
];

// Every voice permission: disconnect/move, server mute and deafen, plus everything a member can do in voice.
const VOICE_MODERATOR_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.PrioritySpeaker,
  PermissionFlagsBits.RequestToSpeak,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.UseExternalSounds,
  PermissionFlagsBits.UseEmbeddedActivities,
  // No Set Voice Status: discord.js has no flag for it (PermissionFlagsBits.SetVoiceChannelStatus is
  // undefined), and an undefined flag makes every permission sync and the permission board throw.
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
];

// Trial moderator: /warn and /timeout (ModerateMembers), /kick (KickMembers) and /usernotes (ManageMessages); never ban.
const TRIAL_MODERATOR_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageMessages,
];

// Support staff answer tickets only: no moderation permission at all.
const SUPPORT_STAFF_PERMISSIONS = [
  ...BASE_PERMISSIONS,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
];

// Highest first. 🛡️ Admin and everything above it are Administrator; below it, the most a role gets is
// every permission but Administrator (report #208).
const ROLE_DEFINITIONS = [
  { name: '👑 Owner', color: '#f1c40f', permissions: [PermissionFlagsBits.Administrator] },
  { name: '⚡ Head Admin', color: '#e74c3c', permissions: [PermissionFlagsBits.Administrator] },
  { name: '🛡️ Admin', color: '#e67e22', permissions: [PermissionFlagsBits.Administrator] },
  { name: '🎖️ Supervisor', color: '#9b59b6', permissions: [ALL_EXCEPT_ADMINISTRATOR], allButAdministrator: true },
  { name: '⚔️ Senior Moderator', color: '#16a085', permissions: [ALL_EXCEPT_ADMINISTRATOR], allButAdministrator: true },
  // allButAdministrator: the board sums Moderator up in one line; ~50 permissions spelled out would not fit Discord's embed limits.
  { name: '🔨 Moderator', color: '#2ecc71', permissions: [ALL_EXCEPT_ADMINISTRATOR], allButAdministrator: true },
  { name: '💬 Chat Moderator', color: '#e84393', permissions: CHAT_MODERATOR_PERMISSIONS },
  { name: '🎧 Voice Moderator', color: '#6c5ce7', permissions: VOICE_MODERATOR_PERMISSIONS },
  { name: '🔰 Trial Moderator', color: '#3498db', permissions: TRIAL_MODERATOR_PERMISSIONS },
  { name: '🎫 Support Staff', color: '#95a5a6', permissions: SUPPORT_STAFF_PERMISSIONS },
];

// role.permissions.toArray() returns flag names ('ViewAuditLog'), while the labels are keyed by bit.
function permissionNames(permissions) {
  return permissions.map((permission) => `✅ ${PERMISSION_LABELS.get(PermissionFlagsBits[permission] ?? permission) || permission}`);
}

function allButAdministratorLines(role) {
  const lines = ['✅ كل الصلاحيات ما عدا Administrator'];
  const missing = role.permissions.missing(ALL_EXCEPT_ADMINISTRATOR, false);
  if (missing.length) lines.push(`❌ ناقصة: ${missing.join(', ')}`);
  return lines;
}

// A plain embed object rather than an EmbedBuilder: src/utils/embeds.js drops builder footers (and strips emojis),
// and the footer is how the bot recognizes its board message to edit it instead of posting a new one.
function buildBoardEmbed(role, definition) {
  const permissionLines = definition.allButAdministrator ? allButAdministratorLines(role) : permissionNames(role.permissions.toArray());
  return {
    color: role.color || parseInt(definition.color.slice(1), 16),
    title: `${role.name} — الصلاحيات`,
    description: `الرتبة: ${role}\n\n${permissionLines.join('\n') || 'لا توجد صلاحيات إضافية'}`,
    footer: { text: PERMISSION_BOARD_FOOTER },
  };
}

// Staff role IDs, by definition name, so a role the owner renamed is still recognised.
const STAFF_ROLE_IDS_KEY = 'staffRoleIds';

async function savedStaffRoleIds(guild) {
  if (!guild.client?.db) return {};
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  return { ...(config?.[STAFF_ROLE_IDS_KEY] || {}) };
}

/** The staff roles among `roles` (by saved ID or name). */
export async function filterStaffRoles(guild, roles) {
  const staffIds = new Set(Object.values(await savedStaffRoleIds(guild || {})));
  const staffNames = new Set(ROLE_DEFINITIONS.map((definition) => definition.name));
  return [...roles].filter((role) => staffIds.has(role.id) || (staffNames.has(role.name) && !role.managed));
}

/** Whether `member` is staff: one of the staff roles (by saved ID or name), or Manage Messages. */
export async function isStaffMember(member) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageMessages)) return true;
  const staffIds = new Set(Object.values(await savedStaffRoleIds(member.guild || {})));
  const staffNames = new Set(ROLE_DEFINITIONS.map((definition) => definition.name));
  return [...(member.roles?.cache?.values?.() || [])].some((role) => staffIds.has(role.id) || staffNames.has(role.name));
}

function findStaffRole(roles, definition, savedIds) {
  return (savedIds[definition.name] && roles.get(savedIds[definition.name]))
    || roles.find((candidate) => candidate.name === definition.name && !candidate.managed);
}

/**
 * Remembers the IDs of the staff roles that exist, so a role the owner renamed is still found for the
 * permission board. The bot never creates, edits, moves or deletes a role: that is the owner's alone.
 */
export async function rememberStaffRoles(guild) {
  const roles = await guild.roles.fetch();
  const savedIds = await savedStaffRoleIds(guild);
  let found = 0;
  for (const definition of ROLE_DEFINITIONS) {
    const role = findStaffRole(roles, definition, savedIds);
    if (!role) continue;
    savedIds[definition.name] = role.id;
    found += 1;
  }
  if (guild.client?.db) await updateGuildConfig(guild.client, guild.id, { [STAFF_ROLE_IDS_KEY]: savedIds }).catch(() => {});
  return { found };
}

// Report #208, done once (the bot doesn't keep editing roles: they are the owner's): every role below
// 🛡️ Admin that has Administrator gets every permission except Administrator. Bump the version to run
// it again on the next startup.
const ADMIN_STRIP_VERSION = 1;
const ADMIN_STRIP_KEY = 'adminStripVersion';

export async function demoteAdministratorsBelowAdmin(guild) {
  if (!isHomeGuild(guild?.id)) return { status: 'skipped' };
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  if ((config?.[ADMIN_STRIP_KEY] || 0) >= ADMIN_STRIP_VERSION) return { status: 'done-before', changed: [], failed: [] };
  const roles = await guild.roles.fetch();
  const admin = findStaffRole(roles, ROLE_DEFINITIONS.find((definition) => definition.name === '🛡️ Admin'), await savedStaffRoleIds(guild));
  if (!admin) return { status: 'no-admin-role', changed: [], failed: [] };
  const targets = [...roles.values()].filter((role) => role.position < admin.position && role.id !== guild.id && !role.managed
    && role.permissions.has(PermissionFlagsBits.Administrator));
  const changed = [];
  const failed = [];
  for (const role of targets) {
    const done = await role.setPermissions(ALL_EXCEPT_ADMINISTRATOR, 'Report #208: below Admin, every permission but Administrator')
      .then(() => true)
      .catch((error) => {
        logger.warn(`Could not take Administrator off ${role.name}: ${error.message}`);
        return false;
      });
    (done ? changed : failed).push(role.name);
  }
  // A role the bot couldn't change (above the bot's role) is tried again on the next startup.
  if (!failed.length) await updateGuildConfig(guild.client, guild.id, { [ADMIN_STRIP_KEY]: ADMIN_STRIP_VERSION }).catch(() => {});
  return { status: 'done', changed, failed };
}

const BOARD_KEY = 'staffPermissions';
// Bump this to wipe the permission channel once more and post a fresh board on the next startup.
// Otherwise the bot never posts in that channel; it only edits its board message.
const BOARD_RESET_VERSION = 1;
const BOARD_RESET_CONFIG_KEY = 'staffPermissionBoardResetVersion';
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 - 60_000;

async function fetchBoardChannel(guild, { reset = false } = {}) {
  const channel = await guild.channels.fetch(ROLE_PERMISSIONS_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`Permission channel ${ROLE_PERMISSIONS_CHANNEL_ID} was not found in guild ${guild.id}`);

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;
  const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory];
  if (reset) required.push(PermissionFlagsBits.ManageMessages);
  if (!permissions?.has(required)) throw new Error(`Missing permissions in channel ${ROLE_PERMISSIONS_CHANNEL_ID}: ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory${reset ? ' and ManageMessages' : ''} are required`);
  return channel;
}

// One message holds every staff role's embed (one embed per role, in hierarchy order).
async function buildBoardEmbeds(guild) {
  const roles = await guild.roles.fetch();
  const savedIds = await savedStaffRoleIds(guild);
  return ROLE_DEFINITIONS.flatMap((definition) => {
    const role = findStaffRole(roles, definition, savedIds);
    return role ? [buildBoardEmbed(role, definition)] : [];
  });
}

/** Deletes every message in the channel, the bot's own included. Messages older than 14 days can't be bulk deleted, so they go one by one. */
async function wipeChannel(channel) {
  let deleted = 0;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100 });
    if (!batch.size) break;
    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const recent = [...batch.values()].filter((message) => message.createdTimestamp > cutoff);
    const old = [...batch.values()].filter((message) => message.createdTimestamp <= cutoff);
    let removed = 0;
    if (recent.length > 1) removed += (await channel.bulkDelete(recent.map((message) => message.id), true)).size;
    else if (recent.length === 1) removed += await recent[0].delete().then(() => 1).catch(() => 0);
    for (const message of old) removed += await message.delete().then(() => 1).catch(() => 0);
    deleted += removed;
    if (!removed) break;
  }
  return deleted;
}

const isBoard = (guild) => (message) => message.author?.id === guild.client.user.id && message.embeds[0]?.footer?.text === PERMISSION_BOARD_FOOTER;

/**
 * Edits the bot's permission board to match the current roles. It never posts: when the board message
 * is missing, nothing is sent ({ status: 'missing' }).
 * With `reset`, every message in the channel is deleted first and one fresh board message is posted.
 */
export async function publishStaffPermissionBoard(guild, { reset = false } = {}) {
  const channel = await fetchBoardChannel(guild, { reset });
  const embeds = await buildBoardEmbeds(guild);
  const result = { guildId: guild.id, channelId: channel.id, deleted: 0 };

  if (reset) {
    result.deleted = await wipeChannel(channel);
    if (!embeds.length) return { ...result, status: 'no-roles' };
    const posted = await channel.send({ embeds });
    await rememberBoardMessage(channel, BOARD_KEY, posted.id);
    logger.info(`Permission board in guild ${guild.id}: channel ${channel.id} cleared (${result.deleted} messages) and the board was posted`);
    return { ...result, status: 'sent' };
  }

  const existing = await findBoardMessage(channel, BOARD_KEY, isBoard(guild));
  if (!existing) return { ...result, status: 'missing' };
  if (!embeds.length) return { ...result, status: 'no-roles' };
  await existing.edit({ embeds });
  return { ...result, status: 'updated' };
}

/**
 * Startup refresh: the first run after BOARD_RESET_VERSION changes clears the channel and posts the board
 * once; every other run only edits the existing board message.
 */
export async function refreshStaffPermissionBoard(guild) {
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  // Without the config the reset state is unknown, so play safe and only edit.
  const reset = Boolean(config) && config[BOARD_RESET_CONFIG_KEY] !== BOARD_RESET_VERSION;
  const result = await publishStaffPermissionBoard(guild, { reset });
  if (reset) await updateGuildConfig(guild.client, guild.id, { [BOARD_RESET_CONFIG_KEY]: BOARD_RESET_VERSION });
  return result;
}

export { ROLE_DEFINITIONS, ALL_EXCEPT_ADMINISTRATOR, CHAT_MODERATOR_PERMISSIONS, VOICE_MODERATOR_PERMISSIONS, TRIAL_MODERATOR_PERMISSIONS, SUPPORT_STAFF_PERMISSIONS, ROLE_PERMISSIONS_CHANNEL_ID, BOARD_RESET_VERSION };
