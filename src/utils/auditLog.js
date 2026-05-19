import { logger } from './logger.js';

/**
 * Resolve who performed an action via the guild audit log.
 *
 * Discord writes audit-log entries slightly after the gateway event fires,
 * so we wait briefly before fetching. Returns null when the audit log is
 * unavailable (missing ViewAuditLog permission) or no recent matching entry
 * exists — callers should treat that as "performed by the user / unknown".
 *
 * @param {import('discord.js').Guild} guild
 * @param {number} auditType - an AuditLogEvent.* value
 * @param {object} [opts]
 * @param {string} [opts.targetId] - only accept entries whose target is this id
 * @param {number} [opts.windowMs=5000] - max age of an accepted entry
 * @param {number} [opts.delayMs=600] - wait before fetching (audit-log lag)
 * @returns {Promise<{text:string, executor:object, reason:?string}|null>}
 */
export async function fetchExecutor(guild, auditType, opts = {}) {
  const { targetId = null, windowMs = 5000, delayMs = 600 } = opts;

  try {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const logs = await guild.fetchAuditLogs({ limit: 6, type: auditType });

    const entry = logs.entries.find((e) => {
      if (Date.now() - e.createdTimestamp > windowMs) return false;
      if (targetId && e.target?.id !== targetId) return false;
      return true;
    });

    if (!entry?.executor) return null;

    return {
      text: `${entry.executor.tag} (${entry.executor.id})`,
      executor: entry.executor,
      reason: entry.reason || null,
    };
  } catch (err) {
    logger?.debug?.(`auditLog: could not resolve executor (${err?.message || err})`);
    return null;
  }
}

/**
 * Safe display string for an embed field.
 */
export function executorText(result, fallback = 'No se pudo determinar') {
  return result?.text || fallback;
}
