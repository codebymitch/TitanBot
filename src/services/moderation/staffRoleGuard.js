// staffRoleGuard.js — staff roles can only be taken off by the trusted (owner's request), in our server only.
//
// When a staff role (staffRoleHierarchyService.js: saved ID or name) is removed from a member, the audit
// log says who did it. If that member isn't trusted (the owners, the bot, or the Anti-Nuke trusted list:
// members or roles), the bot gives the role back and warns them (warnEscalation.js, 3 warnings = timeout),
// with a line in the moderation log. A member taking a staff role off themselves is left alone.

import { isHomeGuild } from '../../config/homeGuild.js';
import { getGuildConfig } from '../config/guildConfig.js';
import { filterStaffRoles } from '../staffRoleHierarchyService.js';
import { findRecentAuditEntry, isTrusted, AuditLogEvent } from '../../utils/antiNukeLogging.js';
import { issueWarning } from './warnEscalation.js';
import { sendModerationActionLog } from './moderationActionLogService.js';
import { logger } from '../../utils/logger.js';

const AUDIT_RETRY_MS = 1_500;

/**
 * Checks a member update. Returns `{ restored, warned, executorId }` when an untrusted member took staff
 * roles off someone, otherwise null.
 */
export async function guardStaffRoleRemoval(oldMember, newMember, { auditRetryMs = AUDIT_RETRY_MS, warn = issueWarning } = {}) {
    const guild = newMember?.guild;
    if (!guild || !isHomeGuild(guild.id) || !oldMember?.roles?.cache) return null;
    const removed = [...oldMember.roles.cache.values()].filter((role) => !newMember.roles.cache.has(role.id));
    if (!removed.length) return null;
    const staffRoles = await filterStaffRoles(guild, removed);
    if (!staffRoles.length) return null;

    const staffIds = new Set(staffRoles.map((role) => role.id));
    const removesStaff = (entry) => entry.changes?.some((change) => change.key === '$remove' && change.new?.some((role) => staffIds.has(role.id)));
    // The audit entry can lag behind the gateway event, so look once more before giving up.
    const entry = await findRecentAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, removesStaff)
        || await new Promise((resolve) => setTimeout(resolve, auditRetryMs))
            .then(() => findRecentAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id, removesStaff));
    const executorId = entry?.executor?.id;
    if (!executorId || executorId === newMember.id) return null;
    const config = await getGuildConfig(guild.client, guild.id).catch(() => null);
    if (await isTrusted(guild, config, executorId)) return null;

    const names = staffRoles.map((role) => role.name).join('، ');
    const restored = await newMember.roles.add([...staffIds], `شال رول إدارة من غير تراست: ${entry.executor.tag || executorId}`)
        .then(() => true)
        .catch((error) => {
            logger.warn(`[STAFF_ROLE_GUARD] Could not give ${names} back to ${newMember.id}: ${error.message}`);
            return false;
        });

    const reason = `شال رول إدارة (${names}) من <@${newMember.id}> من غير تراست`;
    const executor = await guild.members.fetch(executorId).catch(() => null);
    const me = guild.members.me;
    let warned = null;
    if (executor && me) {
        try {
            warned = await warn({ guild, member: executor, moderator: me, reason });
            await sendModerationActionLog(guild, { action: 'warn', targetUser: executor.user, moderatorUser: guild.client.user, reason, warnings: warned.totalCount });
        } catch (error) {
            logger.warn(`[STAFF_ROLE_GUARD] Could not warn ${executorId}: ${error.message}`);
        }
    }
    logger.info('[STAFF_ROLE_GUARD] Staff role removed by an untrusted member', { guildId: guild.id, targetId: newMember.id, executorId, roles: names, restored });
    return { restored, warned: Boolean(warned), executorId };
}
