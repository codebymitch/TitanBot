import { isServerOwner } from '../config/serverOwners.js';
import { canLiftHardBan } from './moderation/hardBanService.js';

// Only owners and trusted members may post invite links to other Discord servers.
// Invites to this server are always allowed. Anyone else has the message deleted
// and gets a short notice (gone after 1 second).
const INVITE_LINK = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/([\w-]+)/giu;
const BLOCKED_NOTICE_DELETE_MS = 1_000;
const INVITE_CACHE_TTL_MS = 10 * 60_000;
const INVITE_CACHE_MAX = 500;

// invite code -> { guildId, expiresAt }; guildId is null when the invite could not be resolved.
const inviteGuildCache = new Map();

function extractInviteCodes(content) {
  return [...new Set([...content.matchAll(INVITE_LINK)].map((match) => match[1]))];
}

async function resolveInviteGuildId(client, code) {
  const cached = inviteGuildCache.get(code);
  if (cached && cached.expiresAt > Date.now()) return cached.guildId;

  const invite = await client.fetchInvite(code).catch(() => null);
  const guildId = invite?.guild?.id || null;
  if (inviteGuildCache.size >= INVITE_CACHE_MAX) inviteGuildCache.delete(inviteGuildCache.keys().next().value);
  inviteGuildCache.set(code, { guildId, expiresAt: Date.now() + INVITE_CACHE_TTL_MS });
  return guildId;
}

/** An invite counts as foreign unless it resolves to this server (unknown/expired invites are foreign too). */
async function hasForeignInvite(message, codes) {
  const { guild } = message;
  for (const code of codes) {
    if (guild.vanityURLCode && code.toLowerCase() === guild.vanityURLCode.toLowerCase()) continue;
    if (await resolveInviteGuildId(message.client, code) !== guild.id) return true;
  }
  return false;
}

async function canPostForeignInvites(message) {
  if (isServerOwner(message.author.id)) return true;
  return canLiftHardBan(message.guild, message.author.id);
}

/** Returns true when the message was deleted for linking another Discord server. */
export async function handleForeignInviteLink(message) {
  const codes = extractInviteCodes(message.content || '');
  if (!codes.length) return false;
  if (await canPostForeignInvites(message)) return false;
  if (!(await hasForeignInvite(message, codes))) return false;

  await message.delete().catch(() => {});
  const notice = await message.channel.send({
    content: `🚫 <@${message.author.id}> ممنوع روابط سيرفرات تانية، للـ trusted بس.`,
    allowedMentions: { users: [message.author.id] },
  }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), BLOCKED_NOTICE_DELETE_MS);
  return true;
}
