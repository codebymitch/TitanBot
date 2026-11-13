// voiceMilestoneService.js
//
// Rewards members with tiered roles based on the total time they spend in voice
// channels. Time is accumulated per member (guild-scoped). Whenever a member
// crosses a milestone threshold the matching role is granted and every other
// milestone role is removed, so a member always holds at most one voice tier.

import { logger } from '../utils/logger.js';
import { EmbedBuilder } from 'discord.js';
import {
  getVoiceMilestoneConfigKey,
  getVoiceMilestoneUserKey,
  getVoiceMilestoneUsersPrefix,
} from '../utils/database/keys.js';

const HOUR_MS = 60 * 60 * 1000;
const MAX_MILESTONES = 25;
const MAX_LABEL_LENGTH = 100;

/**
 * Ready-made milestone ladder for the Manay Society server. Role IDs are left
 * empty and filled in by an administrator through `/voicemilestone setrole`.
 */
export const VOICE_MILESTONE_PRESET = Object.freeze([
  { hours: 5, label: 'New Face' },
  { hours: 10, label: 'Familiar Face' },
  { hours: 25, label: 'Lounge Regular' },
  { hours: 50, label: 'Society Socialite' },
  { hours: 100, label: 'Manay Insider' },
  { hours: 200, label: 'Inner Circle' },
  { hours: 350, label: 'Society Pillar' },
  { hours: 500, label: 'Manay Icon' },
  { hours: 750, label: 'Society Legend' },
  { hours: 1000, label: 'Hall of Fame' },
]);

// In-memory join timestamps, keyed `${guildId}:${userId}`.
const activeSessions = new Map();

function sessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function hoursToMs(hours) {
  return Math.max(0, Number(hours) || 0) * HOUR_MS;
}

export function hoursToMilliseconds(hours) {
  return hoursToMs(hours);
}

/** Compact "3h 12m" duration for a millisecond value. */
export function formatVoiceDuration(ms) {
  const totalMinutes = Math.floor(Math.max(0, Number(ms) || 0) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Validated, de-duplicated, ascending milestone list. */
export function normalizeMilestones(list) {
  if (!Array.isArray(list)) return [];

  const byHours = new Map();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;

    const hours = Math.floor(Number(entry.hours));
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const label = typeof entry.label === 'string' && entry.label.trim()
      ? entry.label.trim().slice(0, MAX_LABEL_LENGTH)
      : `${hours}h`;

    byHours.set(hours, {
      hours,
      label,
      roleId: entry.roleId ? String(entry.roleId) : null,
    });
  }

  return [...byHours.values()]
    .sort((a, b) => a.hours - b.hours)
    .slice(0, MAX_MILESTONES);
}

export async function getVoiceMilestoneConfig(client, guildId) {
  if (!client?.db) {
    return { enabled: false, announcementChannelId: null, milestones: [] };
  }

  try {
    const raw = await client.db.get(getVoiceMilestoneConfigKey(guildId), {});
    const base = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: base.enabled === true,
      announcementChannelId: base.announcementChannelId ? String(base.announcementChannelId) : null,
      milestones: normalizeMilestones(base.milestones),
    };
  } catch (error) {
    logger.error(`Error reading voice milestone config for guild ${guildId}:`, error);
    return { enabled: false, announcementChannelId: null, milestones: [] };
  }
}

export async function saveVoiceMilestoneConfig(client, guildId, config) {
  const normalized = {
    enabled: config?.enabled === true,
    announcementChannelId: config?.announcementChannelId ? String(config.announcementChannelId) : null,
    milestones: normalizeMilestones(config?.milestones),
  };

  await client.db.set(getVoiceMilestoneConfigKey(guildId), normalized);
  return normalized;
}

export async function getVoiceMilestoneData(client, guildId, userId) {
  const empty = { userId: String(userId), totalMs: 0, updatedAt: null };
  if (!client?.db) return empty;

  try {
    const raw = await client.db.get(getVoiceMilestoneUserKey(guildId, userId), null);
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
      userId: String(userId),
      totalMs: Math.max(0, Math.floor(Number(data.totalMs) || 0)),
      updatedAt: Number(data.updatedAt) || null,
    };
  } catch (error) {
    logger.error(`Error reading voice milestone data for ${guildId}:${userId}:`, error);
    return empty;
  }
}

async function addVoiceTime(client, guildId, userId, deltaMs) {
  const current = await getVoiceMilestoneData(client, guildId, userId);
  const totalMs = current.totalMs + Math.max(0, Math.floor(deltaMs));

  const data = { userId: String(userId), totalMs, updatedAt: Date.now() };
  await client.db.set(getVoiceMilestoneUserKey(guildId, userId), data);
  return data;
}

export async function resetVoiceMilestoneData(client, guildId, userId) {
  activeSessions.delete(sessionKey(guildId, userId));
  await client.db.delete(getVoiceMilestoneUserKey(guildId, userId));
}

/** Resolve which milestone is currently held and which one comes next. */
export function getMilestoneProgress(totalMs, milestones) {
  const sorted = normalizeMilestones(milestones);

  let current = null;
  let next = null;

  for (const milestone of sorted) {
    if (totalMs >= hoursToMs(milestone.hours)) {
      current = milestone;
    } else {
      next = milestone;
      break;
    }
  }

  return { current, next, sorted };
}

async function syncMemberMilestones(client, guild, userId, totalMs, config) {
  const configured = config.milestones.filter((m) => m.roleId);
  if (configured.length === 0) {
    return { granted: null, removed: [] };
  }

  const me = guild.members.me;
  if (!me) {
    return { granted: null, removed: [] };
  }

  let member = null;
  try {
    member = await guild.members.fetch(userId);
  } catch {
    member = null;
  }
  if (!member) {
    return { granted: null, removed: [] };
  }

  const reached = configured.filter((m) => totalMs >= hoursToMs(m.hours));
  const target = reached.length > 0 ? reached[reached.length - 1] : null;

  let granted = null;
  const removed = [];

  for (const milestone of configured) {
    const role = guild.roles.cache.get(milestone.roleId)
      || await guild.roles.fetch(milestone.roleId).catch(() => null);

    // Skip roles that no longer exist or sit above the bot's highest role.
    if (!role || role.position >= me.roles.highest.position) continue;

    const isTarget = Boolean(target && target.hours === milestone.hours);

    if (isTarget) {
      if (!member.roles.cache.has(role.id)) {
        try {
          await member.roles.add(role, 'Voice milestone reached');
          granted = role.id;
        } catch (error) {
          logger.debug(`Failed to grant voice milestone role ${role.id} to ${userId}:`, error);
        }
      }
    } else if (member.roles.cache.has(role.id)) {
      try {
        await member.roles.remove(role, 'Voice milestone tier change');
        removed.push(role.id);
      } catch (error) {
        logger.debug(`Failed to remove voice milestone role ${role.id} from ${userId}:`, error);
      }
    }
  }

  return { granted, removed };
}

function formatAnnouncementDuration(ms) {
  const totalMinutes = Math.floor(Math.max(0, Number(ms) || 0) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours} jam ${minutes} menit`;
  if (hours) return `${hours} jam`;
  return `${minutes} menit`;
}

async function announceMilestone(client, guild, userId, totalMs, milestone, config) {
  if (!config.announcementChannelId) return;

  try {
    const channel = guild.channels.cache.get(config.announcementChannelId)
      || await guild.channels.fetch(config.announcementChannelId).catch(() => null);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return;

    const role = milestone.roleId ? guild.roles.cache.get(milestone.roleId) : null;
    const next = config.milestones.find((entry) => entry.hours > milestone.hours);
    const embed = new EmbedBuilder()
      .setColor(role?.color || 0xD6B15E)
      .setTitle('🎙️ Voice Milestone')
      .setDescription(
        `Selamat! Kamu mencapai **${role?.name || milestone.label}** setelah ` +
        `**${formatAnnouncementDuration(totalMs)}** di voice channel.`,
      )
      .addFields(
        { name: 'Total Voice', value: formatAnnouncementDuration(totalMs), inline: true },
        {
          name: 'Target Berikutnya',
          value: next ? `**${next.label}** (${next.hours} jam)` : '🏆 Tier tertinggi tercapai!',
          inline: true,
        },
      )
      .setFooter({ text: 'Manay Society' });

    await channel.send({
      content: `<@${userId}>`,
      embeds: [embed],
      allowedMentions: { users: [userId] },
    });
  } catch (error) {
    logger.warn(`Failed to announce voice milestone for ${userId} in guild ${guild.id}:`, error);
  }
}

async function commitSession(client, guildId, userId, { resume = false } = {}) {
  const key = sessionKey(guildId, userId);
  const startedAt = activeSessions.get(key);
  if (startedAt == null) return null;

  const config = await getVoiceMilestoneConfig(client, guildId);
  if (!config.enabled) {
    activeSessions.delete(key);
    return null;
  }

  const now = Date.now();
  const deltaMs = now - startedAt;

  if (resume) {
    activeSessions.set(key, now);
  } else {
    activeSessions.delete(key);
  }

  if (deltaMs <= 0) return null;

  const data = await addVoiceTime(client, guildId, userId, deltaMs);

  const guild = client.guilds?.cache?.get(guildId);
  const roles = guild
    ? await syncMemberMilestones(client, guild, userId, data.totalMs, config)
    : { granted: null, removed: [] };

  if (guild && roles.granted) {
    const milestone = config.milestones.find((entry) => entry.roleId === roles.granted);
    if (milestone) {
      await announceMilestone(client, guild, userId, data.totalMs, milestone, config);
    }
  }

  return { guildId, userId, totalMs: data.totalMs, deltaMs, ...roles };
}

export async function trackVoiceJoin(client, guildId, userId) {
  const config = await getVoiceMilestoneConfig(client, guildId);
  const key = sessionKey(guildId, userId);

  if (!config.enabled) {
    activeSessions.delete(key);
    return;
  }

  if (!activeSessions.has(key)) {
    activeSessions.set(key, Date.now());
  }
}

export async function trackVoiceLeave(client, guildId, userId) {
  return commitSession(client, guildId, userId, { resume: false });
}

export async function trackVoiceMove(client, guildId, userId) {
  const config = await getVoiceMilestoneConfig(client, guildId);
  const key = sessionKey(guildId, userId);

  if (!config.enabled) {
    activeSessions.delete(key);
    return null;
  }

  const result = await commitSession(client, guildId, userId, { resume: true });

  // Keep counting while the member stays connected in the new channel.
  if (!activeSessions.has(key)) {
    activeSessions.set(key, Date.now());
  }

  return result;
}

/** Periodic commit so long voice sessions still award milestones. */
export async function flushVoiceSessions(client) {
  const results = [];

  for (const key of [...activeSessions.keys()]) {
    const [guildId, userId] = key.split(':');
    if (!guildId || !userId) {
      activeSessions.delete(key);
      continue;
    }

    try {
      const result = await commitSession(client, guildId, userId, { resume: true });
      if (result) results.push(result);
    } catch (error) {
      logger.error(`Failed to flush voice milestone session ${key}:`, error);
    }
  }

  return results;
}

/** Re-apply milestone roles for one member based on their recorded time. */
export async function applyMilestonesForMember(client, guildId, userId) {
  const config = await getVoiceMilestoneConfig(client, guildId);
  const guild = client.guilds?.cache?.get(guildId);
  if (!guild) {
    return { granted: null, removed: [] };
  }

  const data = await getVoiceMilestoneData(client, guildId, userId);
  return syncMemberMilestones(client, guild, userId, data.totalMs, config);
}

/** Re-apply milestone roles for every member tracked in the guild. */
export async function recheckAllMembers(client, guildId) {
  const config = await getVoiceMilestoneConfig(client, guildId);
  const guild = client.guilds?.cache?.get(guildId);
  if (!guild || config.milestones.filter((m) => m.roleId).length === 0) {
    return { checked: 0 };
  }

  const prefix = getVoiceMilestoneUsersPrefix(guildId);
  const keys = await client.db.list(prefix);

  let checked = 0;
  for (const key of keys) {
    const userId = key.slice(prefix.length);
    if (!userId) continue;

    const data = await getVoiceMilestoneData(client, guildId, userId);
    await syncMemberMilestones(client, guild, userId, data.totalMs, config);
    checked += 1;
  }

  return { checked };
}

export default {
  VOICE_MILESTONE_PRESET,
  normalizeMilestones,
  formatVoiceDuration,
  getVoiceMilestoneConfig,
  saveVoiceMilestoneConfig,
  getVoiceMilestoneData,
  getMilestoneProgress,
  resetVoiceMilestoneData,
  trackVoiceJoin,
  trackVoiceLeave,
  trackVoiceMove,
  flushVoiceSessions,
  applyMilestonesForMember,
  recheckAllMembers,
};
