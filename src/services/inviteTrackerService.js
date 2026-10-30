import { PermissionFlagsBits } from 'discord.js';
import { getGuildConfig } from './config/guildConfig.js';
import { getAuditLogChannelId } from './auditLogChannelsService.js';
import { registerJoin } from './inviteRewardService.js';
import { logger } from '../utils/logger.js';

// Works out which invite a new member used by comparing invite use counts before and after the join,
// saves it for the invite rewards (inviteRewardService.js) and posts it to the `invites` log channel.
// Needs Manage Server to read invites.
const VANITY = 'vanity';
const cache = new Map(); // guildId -> Map<code, { uses, maxUses, inviterId }>
const queues = new Map(); // guildId -> Promise, so joins that land together are compared one at a time
const joins = new Map(); // guildId:memberId:joinedAt -> Promise of the join's result, shared by every caller

function canReadInvites(guild) {
  return Boolean(guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuild));
}

async function snapshot(guild) {
  const invites = await guild.invites.fetch({ cache: false });
  const map = new Map([...invites.values()].map((invite) => [invite.code, {
    uses: invite.uses ?? 0,
    maxUses: invite.maxUses ?? 0,
    inviterId: invite.inviter?.id || invite.inviterId || null,
  }]));
  if (guild.vanityURLCode) {
    const vanity = await guild.fetchVanityData().catch(() => null);
    if (vanity) map.set(VANITY, { uses: vanity.uses ?? 0, maxUses: 0, inviterId: null, vanityCode: vanity.code });
  }
  return map;
}

export async function cacheGuildInvites(guild) {
  if (!canReadInvites(guild)) return false;
  cache.set(guild.id, await snapshot(guild));
  return true;
}

// Deleted invites stay in the cache on purpose: one that hit its max uses is deleted right as the
// member joins, and findUsedInvite needs the old entry to spot it.
export function rememberInvite(invite) {
  const invites = cache.get(invite.guild?.id);
  invites?.set(invite.code, { uses: invite.uses ?? 0, maxUses: invite.maxUses ?? 0, inviterId: invite.inviter?.id || invite.inviterId || null });
}

/** Compares two snapshots and returns the code + details of the invite that was used, or null. */
export function findUsedInvite(before, after) {
  for (const [code, now] of after) {
    const old = before.get(code);
    if (now.uses > (old?.uses ?? 0)) return { code, ...now, uses: now.uses };
  }
  // A limited invite that reached its last use is deleted, so it is missing from `after`.
  for (const [code, old] of before) {
    if (!after.has(code) && old.maxUses && old.uses + 1 >= old.maxUses) return { code, ...old, uses: old.uses + 1 };
  }
  return null;
}

export function countInvitesBy(invites, inviterId) {
  let total = 0;
  for (const invite of invites.values()) if (invite.inviterId === inviterId) total += invite.uses;
  return total;
}

async function processJoin(member) {
  const { guild } = member;
  if (!canReadInvites(guild)) return null;

  const before = cache.get(guild.id) || new Map();
  const after = await snapshot(guild);
  cache.set(guild.id, after);
  const used = findUsedInvite(before, after);

  const reward = await registerJoin(member.client, member, used?.inviterId || null)
    .catch((error) => {
      logger.error(`Invite reward registration failed for ${member.user?.tag}:`, error);
      return null;
    });
  await logJoin(member, used, after)
    .catch((error) => logger.error(`Invite log failed for ${member.user?.tag} in ${guild.name}:`, error));
  return { used, reward };
}

async function logJoin(member, used, after) {
  const { guild } = member;
  const config = await getGuildConfig(member.client, guild.id);
  const channelId = getAuditLogChannelId(config, 'invites');
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel?.isTextBased?.()) return;

  let inviteLine = '**الدعوة:** غير معروفة';
  let inviterLine = '**دعاه:** غير معروف';
  if (used?.code === VANITY) {
    inviteLine = `**الدعوة:** رابط السيرفر (discord.gg/${used.vanityCode || guild.vanityURLCode})`;
    inviterLine = '**دعاه:** رابط السيرفر';
  } else if (used) {
    inviteLine = `**الدعوة:** \`${used.code}\` (${used.uses} استخدام)`;
    inviterLine = used.inviterId
      ? `**دعاه:** <@${used.inviterId}> (${used.inviterId}) — عنده ${countInvitesBy(after, used.inviterId)} دعوة`
      : '**دعاه:** غير معروف';
  }

  await channel.send({
    embeds: [{
      title: '📨 عضو دخل',
      color: 0x57f287,
      thumbnail: { url: member.user.displayAvatarURL() },
      description: [
        `**العضو:** ${member} (${member.user.tag} - ${member.id})`,
        inviterLine,
        inviteLine,
        `**عمر الحساب:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        `**عدد الأعضاء:** ${guild.memberCount}`,
      ].join('\n'),
      timestamp: new Date().toISOString(),
    }],
    allowedMentions: { parse: [] },
  });
}

/**
 * Handles a member's join once, however many listeners ask (the invite logger and the welcome both do).
 * Resolves to `{ used, reward }` (the invite used and registerJoin's result), or null when invites can't be read.
 */
export function handleMemberJoinInvite(member) {
  const key = `${member.guild.id}:${member.id}:${member.joinedTimestamp}`;
  if (joins.has(key)) return joins.get(key);
  const previous = queues.get(member.guild.id) || Promise.resolve();
  const next = previous
    .then(() => processJoin(member))
    .catch((error) => {
      logger.error(`Invite tracking failed for ${member.user?.tag} in ${member.guild.name}:`, error);
      return null;
    });
  queues.set(member.guild.id, next);
  joins.set(key, next);
  setTimeout(() => joins.delete(key), 60_000).unref?.();
  return next;
}
