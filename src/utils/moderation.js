// moderation.js

import { logEvent as logAuditEvent, EVENT_TYPES } from '../services/loggingService.js';
import { formatLogLine } from './logEmbeds.js';
import { logger } from './logger.js';
import { getFromDb, setInDb } from './database.js';

const ACTION_TO_EVENT_TYPE = {
  'Member Banned': EVENT_TYPES.MODERATION_BAN,
  'Member Kicked': EVENT_TYPES.MODERATION_KICK,
  'Member Timed Out': EVENT_TYPES.MODERATION_TIMEOUT,
  'Member Untimeouted': EVENT_TYPES.MODERATION_UNTIMEOUT,
  'Member Unbanned': EVENT_TYPES.MODERATION_UNBAN,
  'User Warned': EVENT_TYPES.MODERATION_WARN,
  'Warnings Viewed': EVENT_TYPES.MODERATION_WARN,
  'Messages Purged': EVENT_TYPES.MODERATION_PURGE,
  'Channel Locked': EVENT_TYPES.MODERATION_LOCK,
  'Channel Unlocked': EVENT_TYPES.MODERATION_UNLOCK,
  'DM Sent': EVENT_TYPES.MODERATION_DM,
  'Log Channel Activated': EVENT_TYPES.MODERATION_CONFIG,
  'Log Filter Updated': EVENT_TYPES.MODERATION_CONFIG,
  'Case Created': EVENT_TYPES.MODERATION_CONFIG,
  'Case Updated': EVENT_TYPES.MODERATION_CONFIG,
};

function buildModerationLogData(event) {
  const targetIdMatch = event.target?.match(/\((\d+)\)/);
  const targetId = targetIdMatch?.[1];
  const executorIdMatch = event.executor?.match(/\((\d+)\)/);
  const executorTag = event.executor?.split(' (')[0] || 'Moderator';

  const lines = [];
  if (event.target) {
    lines.push(formatLogLine('User', event.target));
  }
  if (event.reason) {
    const reason = event.reason.length > 900
      ? `${event.reason.substring(0, 897)}...`
      : event.reason;
    lines.push(formatLogLine('Reason', reason));
  }
  if (event.duration) {
    lines.push(formatLogLine('Duration', event.duration));
  }
  if (event.caseId) {
    lines.push(formatLogLine('Case', `\`${event.caseId}\``));
  }

  const meta = [];
  if (event.metadata) {
    Object.entries(event.metadata).forEach(([key, value]) => {
      if (value !== undefined && value !== null && key !== 'userId' && key !== 'moderatorId') {
        meta.push([key.charAt(0).toUpperCase() + key.slice(1), String(value)]);
      }
    });
  }

  const title = event.caseId ? `${event.action} · Case #${event.caseId}` : event.action;

  return {
    title,
    lines,
    meta,
    userId: event.metadata?.userId || targetId || undefined,
    thumbnail: targetId ? `https://cdn.discordapp.com/embed/avatars/${Number(targetId) % 5}.png` : undefined,
    footer: executorIdMatch
      ? { text: executorTag, iconURL: undefined }
      : undefined,
  };
}

export async function logEvent({ client, guild, guildId, event }) {
  try {
    if (!guild && guildId) {
      guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    }
    if (!guild) {
      logger.warn('logEvent invoked without valid guild or guildId');
      return;
    }

    const eventType = ACTION_TO_EVENT_TYPE[event.action] || EVENT_TYPES.MODERATION_CONFIG;
    const data = buildModerationLogData(event);

    await logAuditEvent({
      client,
      guildId: guild.id,
      eventType,
      data,
    });

    logger.info(`Moderation action logged: ${event.action} by ${event.executor} on ${event.target} in guild ${guild.id}`);
  } catch (error) {
    logger.error('Error logging moderation event:', error);
  }
}

export async function generateCaseId(client, guildId) {
  try {
    const caseKey = `moderation_cases_${guildId}`;
    const currentCase = await getFromDb(caseKey, 0);
    const nextCase = currentCase + 1;
    await setInDb(caseKey, nextCase);
    return nextCase;
  } catch (error) {
    logger.error("Error generating case ID:", error);
return Date.now();
  }
}

export async function storeModerationCase({ guildId, caseId, caseData }) {
  try {
    const caseKey = `moderation_case_${guildId}_${caseId}`;
    const caseDataWithTimestamp = {
      ...caseData,
      createdAt: new Date().toISOString(),
      caseId
    };
    
    await setInDb(caseKey, caseDataWithTimestamp);
    
    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    caseList.push(caseDataWithTimestamp);
    
    if (caseList.length > 1000) {
      caseList.splice(0, caseList.length - 1000);
    }
    
    await setInDb(caseListKey, caseList);
    return true;
  } catch (error) {
    logger.error("Error storing moderation case:", error);
    return false;
  }
}

export async function getModerationCases(guildId, filters = {}) {
  try {
    const { userId, moderatorId, action, limit = 50, offset = 0 } = filters;
    
    const allCases = [];
    
    const caseListKey = `moderation_cases_list_${guildId}`;
    const caseList = await getFromDb(caseListKey, []);
    
    let filteredCases = caseList;
    
    if (userId) {
      filteredCases = filteredCases.filter(case_ => case_.targetUserId === userId);
    }
    
    if (moderatorId) {
      filteredCases = filteredCases.filter(case_ => case_.moderatorId === moderatorId);
    }
    
    if (action) {
      filteredCases = filteredCases.filter(case_ => case_.action === action);
    }
    
    filteredCases.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    return filteredCases.slice(offset, offset + limit);
  } catch (error) {
    logger.error("Error getting moderation cases:", error);
    return [];
  }
}

export async function logModerationAction({ client, guild, event }) {
  const caseId = await generateCaseId(client, guild.id);
  
  await storeModerationCase({
    guildId: guild.id,
    caseId,
    caseData: {
      action: event.action,
      target: event.target,
      executor: event.executor,
      reason: event.reason,
      duration: event.duration,
      metadata: event.metadata,
      targetUserId: event.metadata?.userId,
      moderatorId: event.metadata?.moderatorId
    }
  });
  
  await logEvent({
    client,
    guild,
    event: {
      ...event,
      caseId
    }
  });
  
  return caseId;
}