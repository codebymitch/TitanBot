import { PermissionFlagsBits } from 'discord.js';
import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import { logger } from '../utils/logger.js';

// Images/files, GIFs and links are for members of the `media` role (and admins) only.
// The role and its permissions are the owner's to set: the bot never changes them. Discord permissions
// can't stop a plain link from being sent, so the message guard below deletes those.
const MEDIA_ROLE_NAME = 'media';
const BLOCKED_NOTICE_DELETE_MS = 5_000;
// Guild config flag set once every member who was in the server got the media role.
const GRANTED_TO_ALL_KEY = 'mediaRoleGrantedToAll';

const LINK = /(?:https?:\/\/|www\.)\S+|(?:discord(?:app)?\.com\/invite|discord\.gg)\/[\w-]+/iu;

// The media role's ID per server, so a media role the owner renamed is still the media role.
const MEDIA_ROLE_ID_KEY = 'mediaRoleId';
const mediaRoleIds = new Map(); // guildId -> roleId

/** Whether `role` is the server's media role (the saved one, or one named `media`). */
export function isMediaRole(role, guildId = role?.guild?.id) {
  if (!role || role.managed) return false;
  return role.id === mediaRoleIds.get(guildId) || role.name === MEDIA_ROLE_NAME;
}

async function savedMediaRoleId(guild) {
  if (!guild.client?.db) return mediaRoleIds.get(guild.id) || null;
  const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
  return config?.[MEDIA_ROLE_ID_KEY] || mediaRoleIds.get(guild.id) || null;
}

/**
 * Finds the media role (the saved one, else one named `media`) and remembers its ID. The bot never
 * creates, edits or moves it, and never changes @everyone's or chaos's permissions.
 */
export async function findMediaRole(guild) {
  const roles = await guild.roles.fetch();
  const savedId = await savedMediaRoleId(guild);
  const media = (savedId && roles.get(savedId)) || roles.find((role) => role.name === MEDIA_ROLE_NAME && !role.managed);
  if (!media) {
    logger.warn(`Media role not found in ${guild.name} (the bot doesn't create roles).`);
    return null;
  }
  mediaRoleIds.set(guild.id, media.id);
  if (guild.client?.db && savedId !== media.id) {
    await updateGuildConfig(guild.client, guild.id, { [MEDIA_ROLE_ID_KEY]: media.id }).catch(() => {});
  }
  return media;
}

/**
 * Gives the media role once to every member (bots aside) in the server at that moment.
 * A flag in the guild config stops it from running again, so members who join later don't get it.
 */
export async function grantMediaRoleToAllMembers(guild) {
  const db = guild.client?.db;
  if (typeof db?.get !== 'function' || (typeof db.isAvailable === 'function' && !db.isAvailable())) {
    // Without the database the flag can't be read or saved, so it would repeat on every restart.
    logger.warn(`Media role grant skipped for ${guild.name}: database unavailable.`);
    return { skipped: true, granted: 0, failed: 0 };
  }

  const config = await getGuildConfig(guild.client, guild.id);
  if (config?.[GRANTED_TO_ALL_KEY]) return { skipped: true, granted: 0, failed: 0 };

  const media = guild.roles.cache.find((role) => isMediaRole(role, guild.id));
  if (!media?.editable) {
    logger.warn(`Media role grant skipped for ${guild.name}: the role is missing or above the bot's highest role.`);
    return { skipped: true, granted: 0, failed: 0 };
  }

  const members = await guild.members.fetch();
  let granted = 0;
  let failed = 0;
  for (const member of members.values()) {
    if (member.user.bot || member.roles.cache.has(media.id)) continue;
    try {
      await member.roles.add(media, 'Media role for everyone in the server');
      granted += 1;
    } catch (error) {
      failed += 1;
      logger.warn(`Could not give the media role to ${member.user.tag} in ${guild.name}: ${error.message}`);
    }
  }

  await updateGuildConfig(guild.client, guild.id, { [GRANTED_TO_ALL_KEY]: true });
  return { skipped: false, granted, failed };
}

/** A message counts as media when it has an attachment or a link (GIF picker links included). */
export function hasMediaContent(message) {
  return Boolean(message.attachments?.size) || LINK.test(message.content || '');
}

// `شغل <link>` / `play <link>` (with or without a prefix) is a music request, not media, so it isn't blocked.
const PLAY_COMMAND = /^\s*[^\p{L}\p{N}\s]{0,3}(?:شغل|play)\s+\S/iu;

export function isPlayCommand(message) {
  return !message.attachments?.size && PLAY_COMMAND.test(message.content || '');
}

async function canSendMedia(message) {
  if (isServerOwner(message.author.id)) return true;
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (member?.roles.cache.some((role) => isMediaRole(role, message.guild.id))) return true;
  if (member?.permissions.has(PermissionFlagsBits.Administrator)) return true;
  return canLiftHardBan(message.guild, message.author.id);
}

/** Returns true when the message was deleted for sending media without the media role. */
export async function handleMediaMessage(message) {
  if (!hasMediaContent(message) || isPlayCommand(message)) return false;
  if (await canSendMedia(message)) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> الصور والـ GIF واللينكات لرتبة ${MEDIA_ROLE_NAME} بس.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}

export { MEDIA_ROLE_NAME };
