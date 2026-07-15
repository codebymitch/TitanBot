import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';

const recentRequests = new Map();
export async function findAuditEntry(guild, action, targetId, { maxAgeMs = 15_000, delayMs = 0 } = {}) {
  try {
    if (!guild?.members?.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) return null;
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    const key = `${guild.id}:${action}:${targetId}`;
    const cached = recentRequests.get(key);
    if (cached && Date.now() - cached.at < 2_000) return cached.entry;
    const logs = await guild.fetchAuditLogs({ type: action, limit: 6 });
    const now = Date.now();
    const entry = logs.entries.find(item => item.target?.id === targetId && now - item.createdTimestamp <= maxAgeMs) || null;
    recentRequests.set(key, { at: now, entry });
    return entry;
  } catch (error) {
    logger.error('Audit log lookup failed', { error, guildId: guild?.id, action, targetId });
    return null;
  }
}
export const auditActor = entry => entry?.executor ? `${entry.executor} (\`${entry.executor.id}\`)` : 'לא ידוע';
