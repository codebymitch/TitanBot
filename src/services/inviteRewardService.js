// inviteRewardService.js — pays members CC for the people they invite (numbers in config/inviteRewards.js).
//
// Every counted join is saved as `guild:<id>:invite_rewards:<invited member>`:
//   { inviterId, joinedAt, status }
// status is 'pending' until the invited member reaches the level after the stay days, then 'paid'
// (the inviter got the CC). 'left' means they left before that, 'fake' that the account was too new.
// A record is never replaced, so a member who comes back can't be counted a second time.
// The invite roles' IDs are saved in `guild:<id>:invite_reward_roles` ({ [tier count]: roleId }).

import { INVITE_REWARDS, CHAOS_GUILD_ID, WELCOME_CHANNEL_ID } from '../config/inviteRewards.js';
import { CC, ccEmbed } from '../config/cc.js';
import { grantCC } from './cc/ccService.js';
import { getUserLevelData } from './leveling/leveling.js';
import { getChatCounts } from './leveling/chatCounter.js';
import { getEconomyKey } from '../utils/database.js';
import { Mutex } from '../utils/mutex.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 15;

export const STATUS = { PENDING: 'pending', PAID: 'paid', LEFT: 'left', FAKE: 'fake' };

export const inviteRewardPrefix = (guildId) => `guild:${guildId}:invite_rewards:`;
const recordKey = (guildId, memberId) => `${inviteRewardPrefix(guildId)}${memberId}`;
const rolesKey = (guildId) => `guild:${guildId}:invite_reward_roles`;
const lockKey = (guildId, memberId) => `invite-reward:${guildId}:${memberId}`;

const reward = () => `**${INVITE_REWARDS.reward.toLocaleString('en-US')}** ${CC.emoji} ${CC.short}`;

/**
 * Why a join doesn't count, or null when it does: 'unknown' (no inviter), 'self', 'bot' (invited by a
 * bot), 'rejoin' (was in the server before) or 'fake' (account younger than minAccountAgeDays).
 */
export function joinVerdict({ memberId, inviterId, inviterIsBot = false, accountCreatedAt, beenHereBefore = false, now = Date.now() }) {
  if (!inviterId) return 'unknown';
  if (inviterId === memberId) return 'self';
  if (inviterIsBot) return 'bot';
  if (beenHereBefore) return 'rejoin';
  if (now - accountCreatedAt < INVITE_REWARDS.minAccountAgeDays * DAY_MS) return 'fake';
  return null;
}

/**
 * True when the invite is pending, the invited member reached the level, sent enough chat messages
 * (they really took part, not only voice XP) and the stay days are over.
 */
export function isReadyToPay(record, level, now = Date.now(), messages = 0) {
  return record?.status === STATUS.PENDING
    && level >= INVITE_REWARDS.level
    && messages >= (INVITE_REWARDS.minMessages || 0)
    && now - record.joinedAt >= INVITE_REWARDS.minStayDays * DAY_MS;
}

/** Paid and pending invites per inviter: Map<inviterId, { paid, pending }>. */
export function inviteCounts(records) {
  const counts = new Map();
  for (const record of records) {
    if (!record?.inviterId || (record.status !== STATUS.PAID && record.status !== STATUS.PENDING)) continue;
    const entry = counts.get(record.inviterId) || { paid: 0, pending: 0 };
    entry[record.status] += 1;
    counts.set(record.inviterId, entry);
  }
  return counts;
}

/** The inviters ranked by paid invites, then pending ones. */
export function rankInviters(records) {
  return [...inviteCounts(records)].map(([userId, counts]) => ({ userId, ...counts }))
    .sort((a, b) => b.paid - a.paid || b.pending - a.pending);
}

/** The highest invite tier reached with `count` paid invites, or null. */
export function inviteTier(count) {
  return [...INVITE_REWARDS.tiers].sort((a, b) => a.count - b.count).filter((tier) => count >= tier.count).at(-1) || null;
}

/** Roles to add and remove so the member only holds the role of their highest tier. */
export function inviteRoleChanges(count, tierRoleIds = {}, heldRoleIds = new Set()) {
  const tier = inviteTier(count);
  const keep = tier ? tierRoleIds[tier.count] : null;
  return {
    tier,
    add: keep && !heldRoleIds.has(keep) ? [keep] : [],
    remove: Object.values(tierRoleIds).filter((id) => id && id !== keep && heldRoleIds.has(id)),
  };
}

/** `يوصل لفل 5 ويكتب 50 رسالة` (and `ويكمّل N أيام في السيرفر` when a stay is required). */
export function inviteConditions() {
  const stay = INVITE_REWARDS.minStayDays > 0 ? ` ويكمّل ${INVITE_REWARDS.minStayDays} أيام في السيرفر` : '';
  return `يوصل لفل ${INVITE_REWARDS.level} ويكتب ${INVITE_REWARDS.minMessages} رسالة${stay}`;
}

/** The small message under the welcome: who invited the member and what the inviter gets. null when nobody did. */
export function inviteWelcomeNotice(memberId, join) {
  if (!join?.inviterId || ['unknown', 'self', 'bot'].includes(join.reason)) return null;
  const lines = [`-# 📨 دعاه <@${join.inviterId}>`];
  if (!join.reason) {
    lines.push(`-# 🎁 <@${join.inviterId}> هياخد ${reward()} لما <@${memberId}> ${inviteConditions()}`);
  } else if (join.reason === 'fake') {
    lines.push(`-# ⚠️ الدعوة دي مش محسوبة: الحساب عمره أقل من ${INVITE_REWARDS.minAccountAgeDays} أيام`);
  } else if (join.reason === 'rejoin') {
    lines.push(`-# ⚠️ الدعوة دي مش محسوبة: <@${memberId}> كان في السيرفر قبل كده`);
  }
  return lines.join('\n');
}

async function loadRecord(client, guildId, memberId) {
  return client.db.get(recordKey(guildId, memberId), null);
}

async function saveRecord(client, guildId, memberId, record) {
  const saved = await client.db.set(recordKey(guildId, memberId), record);
  if (saved === false) throw new Error('Failed to save invite reward');
}

export async function listInviteRecords(client, guildId) {
  const prefix = inviteRewardPrefix(guildId);
  const keys = await client.db.list(prefix);
  const records = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const record = await client.db.get(key, null);
    if (record) records.push({ memberId: key.slice(prefix.length), ...record });
  }
  return records;
}

/**
 * Saves a new member's invite (called by the invite tracker once it knows which invite was used).
 * Returns `{ inviterId, reason }`: reason is null when the invite counts, see joinVerdict otherwise.
 */
export async function registerJoin(client, member, inviterId, { now = Date.now() } = {}) {
  const { guild } = member;
  if (guild?.id !== CHAOS_GUILD_ID || member.user?.bot) return null;
  return Mutex.runExclusive(lockKey(guild.id, member.id), async () => {
    const existing = await loadRecord(client, guild.id, member.id);
    // A member with a CC record was here before, even when this feature didn't know them yet.
    const beenHereBefore = Boolean(existing) || Boolean(await client.db.get(getEconomyKey(guild.id, member.id), null));
    const reason = joinVerdict({
      memberId: member.id,
      inviterId,
      inviterIsBot: Boolean(guild.members.cache.get(inviterId)?.user?.bot),
      accountCreatedAt: member.user.createdTimestamp,
      beenHereBefore,
      now,
    });
    if (reason === null || reason === 'fake') {
      await saveRecord(client, guild.id, member.id, { inviterId, joinedAt: now, status: reason === 'fake' ? STATUS.FAKE : STATUS.PENDING });
    }
    logger.info('[Invites] Join registered', { guildId: guild.id, memberId: member.id, inviterId, counted: reason === null, reason });
    return { inviterId, reason };
  });
}

/** A pending invite stops counting when the invited member leaves. */
export async function markLeft(client, guildId, memberId, { now = Date.now() } = {}) {
  if (guildId !== CHAOS_GUILD_ID) return;
  await Mutex.runExclusive(lockKey(guildId, memberId), async () => {
    const record = await loadRecord(client, guildId, memberId);
    if (record?.status !== STATUS.PENDING) return;
    await saveRecord(client, guildId, memberId, { ...record, status: STATUS.LEFT, leftAt: now });
    logger.info('[Invites] Invited member left before the reward', { guildId, memberId, inviterId: record.inviterId });
  });
}

/**
 * Pays the inviter when the invited member is ready (see isReadyToPay) and still in the server.
 * `level` can be passed by the level-up that triggered the check. Returns the payment or null.
 */
export async function checkInviteReward(client, guild, memberId, { level = null, now = Date.now() } = {}) {
  if (guild?.id !== CHAOS_GUILD_ID) return null;
  const payment = await Mutex.runExclusive(lockKey(guild.id, memberId), async () => {
    const record = await loadRecord(client, guild.id, memberId);
    if (record?.status !== STATUS.PENDING) return null;
    const currentLevel = level ?? (await getUserLevelData(client, guild.id, memberId)).level;
    const messages = (await getChatCounts(client, guild.id).catch(() => ({})))[memberId] || 0;
    if (!isReadyToPay(record, currentLevel, now, messages)) return null;
    const member = guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
    if (!member) return null;

    // Saved as paid first, so a second check can never pay the same invite twice.
    await saveRecord(client, guild.id, memberId, { ...record, status: STATUS.PAID, paidAt: now });
    try {
      const result = await grantCC(client, guild.id, record.inviterId, INVITE_REWARDS.reward, { source: 'invite', reason: `invited ${memberId}` });
      return { inviterId: record.inviterId, memberId, balance: result.balance };
    } catch (error) {
      await saveRecord(client, guild.id, memberId, record).catch(() => {});
      throw error;
    }
  });
  if (!payment) return null;

  const paid = inviteCounts(await listInviteRecords(client, guild.id)).get(payment.inviterId)?.paid || 0;
  const roles = await syncInviterRoles(client, guild, payment.inviterId, paid).catch((error) => {
    logger.warn(`[Invites] Could not update invite roles of ${payment.inviterId}: ${error.message}`);
    return null;
  });
  await sendPaidNotice(guild, { ...payment, paid, newRoleId: roles?.add[0] || null });
  return { ...payment, paid };
}

async function sendPaidNotice(guild, { inviterId, memberId, paid, newRoleId }) {
  const channel = guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel?.isTextBased?.()) return;
  const lines = [`🎁 <@${inviterId}> أخد ${reward()} عشان <@${memberId}> وصل لفل ${INVITE_REWARDS.level} • دعواتك: **${paid}**`];
  if (newRoleId) lines.push(`🏅 رول جديد: <@&${newRoleId}>`);
  await channel.send({ content: lines.join('\n'), allowedMentions: { users: [inviterId] } })
    .catch((error) => logger.warn(`[Invites] Could not post the reward notice: ${error.message}`));
}

/** Pays every pending invite whose member is ready; runs every checkEveryMinutes for members who hit the level early. */
export async function sweepInviteRewards(client, { now = Date.now() } = {}) {
  const guild = client.guilds.cache.get(CHAOS_GUILD_ID);
  if (!guild) return 0;
  let paid = 0;
  for (const record of await listInviteRecords(client, guild.id)) {
    if (record.status !== STATUS.PENDING || now - record.joinedAt < INVITE_REWARDS.minStayDays * DAY_MS) continue;
    try {
      if (await checkInviteReward(client, guild, record.memberId, { now })) paid += 1;
    } catch (error) {
      logger.error(`[Invites] Failed to pay the invite of ${record.memberId}:`, error);
    }
  }
  return paid;
}

/**
 * The invite roles: the saved ones, else ones with the tier's name. Returns { [tier count]: roleId }.
 * The bot never creates, edits or deletes a role: a missing tier role is skipped until the owner makes it.
 */
export async function findInviteTierRoles(client, guild) {
  const saved = (await client.db.get(rolesKey(guild.id), null)) || {};
  const roles = await guild.roles.fetch();
  const roleIds = {};
  const missing = [];
  for (const tier of INVITE_REWARDS.tiers) {
    const role = (saved[tier.count] && roles.get(saved[tier.count]))
      || [...roles.values()].find((candidate) => candidate.name === tier.name && !candidate.managed);
    if (role) roleIds[tier.count] = role.id;
    else missing.push(tier.name);
  }
  if (missing.length) logger.warn(`Invite roles missing in ${guild.name} (the bot doesn't create roles): ${missing.join(', ')}`);
  if (INVITE_REWARDS.tiers.some((tier) => saved[tier.count] !== roleIds[tier.count])) await client.db.set(rolesKey(guild.id), roleIds);
  return roleIds;
}

async function syncInviterRoles(client, guild, inviterId, paid) {
  const roleIds = await findInviteTierRoles(client, guild);
  const member = guild.members.cache.get(inviterId) || await guild.members.fetch(inviterId).catch(() => null);
  if (!member) return null;
  const changes = inviteRoleChanges(paid, roleIds, new Set(member.roles.cache.keys()));
  if (changes.add.length) await member.roles.add(changes.add, `${paid} invites`);
  if (changes.remove.length) await member.roles.remove(changes.remove, 'Only the highest invite role is kept');
  return changes;
}

/** Finds the invite roles and starts the pending invites check. */
export async function startInviteRewards(client) {
  const guild = client.guilds.cache.get(CHAOS_GUILD_ID);
  if (!guild) return { status: 'guild not found' };
  await findInviteTierRoles(client, guild).catch((error) => logger.error('Failed to find the invite roles:', error));
  const run = () => sweepInviteRewards(client).catch((error) => logger.error('Invite rewards check failed:', error));
  await run();
  setInterval(run, INVITE_REWARDS.checkEveryMinutes * 60 * 1000).unref?.();
  return { status: 'started' };
}

/** `top invites`: inviters ranked by paid invites; with a `userId` their own rank and counts are shown too. */
export async function inviteTopEmbed(client, guild, userId = null) {
  const board = rankInviters(await listInviteRecords(client, guild.id));
  const lines = board.slice(0, PAGE_SIZE).map((row, index) => {
    const pending = row.pending ? ` (+${row.pending} لسه)` : '';
    return `${['🥇', '🥈', '🥉'][index] || `**#${index + 1}**`} <@${row.userId}> — **${row.paid}** دعوة${pending}`;
  });
  const summary = [`📨 ${board.reduce((sum, row) => sum + row.paid, 0)} دعوة محسوبة في السيرفر`];
  if (userId) {
    const rank = board.findIndex((row) => row.userId === userId);
    const own = board[rank] || { paid: 0, pending: 0 };
    summary.unshift(`👤 ترتيبك: ${rank >= 0 ? `**#${rank + 1}**` : '—'} • دعواتك: **${own.paid}**${own.pending ? ` (+${own.pending} لسه)` : ''}`);
  }
  const tiers = INVITE_REWARDS.tiers.map((tier) => `${tier.name.split(' ')[0]} ${tier.count}`).join(' • ');
  return ccEmbed(`📨 Top Invites — ${guild.name}`, [
    lines.join('\n') || 'لسه محدش دعا حد. ادعي صحابك!',
    '',
    summary.join('\n'),
    '',
    `🎁 ${reward()} لكل عضو تدعيه ${inviteConditions()} (الحسابات الأقل من ${INVITE_REWARDS.minAccountAgeDays} أيام واللي كانوا في السيرفر قبل كده مش بيتحسبوا)`,
    `🏅 رولات الدعوات: ${tiers}`,
  ].join('\n'));
}

/** One member's invites: counts per status, rank among inviters, the members they invited (newest first) and who invited them. */
export function memberInviteSummary(records, userId) {
  const invited = records.filter((record) => record.inviterId === userId).sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
  const counts = { paid: 0, pending: 0, left: 0, fake: 0 };
  for (const record of invited) if (record.status in counts) counts[record.status] += 1;
  const rank = rankInviters(records).findIndex((row) => row.userId === userId);
  const nextTier = [...INVITE_REWARDS.tiers].sort((a, b) => a.count - b.count).find((tier) => tier.count > counts.paid) || null;
  return {
    ...counts,
    rank: rank >= 0 ? rank + 1 : null,
    earned: counts.paid * INVITE_REWARDS.reward,
    tier: inviteTier(counts.paid),
    nextTier,
    invited,
    invitedBy: records.find((record) => record.memberId === userId)?.inviterId || null,
  };
}

const STATUS_LABELS = {
  [STATUS.PAID]: '✅ اتحسبت',
  [STATUS.PENDING]: '⏳ لسه',
  [STATUS.LEFT]: '🚪 خرج',
  [STATUS.FAKE]: '⚠️ حساب جديد',
};

/** `انفايت @member`: the member's invites, who they invited and how far they are from the next invite role. */
export async function memberInvitesEmbed(client, guild, target) {
  const summary = memberInviteSummary(await listInviteRecords(client, guild.id), target.id);
  const lines = [
    `${target}`,
    '',
    `📨 الدعوات المحسوبة: **${summary.paid}**${summary.pending ? ` (+${summary.pending} لسه)` : ''}`,
    `🏆 الترتيب: ${summary.rank ? `**#${summary.rank}**` : '—'}`,
    `💰 كسب من الدعوات: **${summary.earned.toLocaleString('en-US')}** ${CC.emoji} ${CC.short}`,
  ];
  if (summary.left || summary.fake) lines.push(`🚫 مش محسوبة: ${summary.left} خرجوا • ${summary.fake} حسابات جديدة`);
  if (summary.tier) lines.push(`🏅 رول الدعوات: ${summary.tier.name}`);
  if (summary.nextTier) lines.push(`🎯 الرول الجاي: ${summary.nextTier.name} (فاضل ${summary.nextTier.count - summary.paid})`);
  if (summary.invitedBy) lines.push(`👋 دعاه: <@${summary.invitedBy}>`);

  lines.push('', '**اللي دعاهم:**');
  if (summary.invited.length) {
    lines.push(...summary.invited.slice(0, PAGE_SIZE).map((record) => {
      const joined = record.joinedAt ? ` • <t:${Math.floor(record.joinedAt / 1000)}:R>` : '';
      return `${STATUS_LABELS[record.status] || record.status} — <@${record.memberId}>${joined}`;
    }));
    if (summary.invited.length > PAGE_SIZE) lines.push(`-# و ${summary.invited.length - PAGE_SIZE} كمان`);
  } else {
    lines.push('لسه مدعاش حد.');
  }
  return ccEmbed('📨 Invites', lines.join('\n'), { thumbnail: target.displayAvatarURL?.() || null });
}
