import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig, updateGuildConfig } from './config/guildConfig.js';
import { CLEANUP_VERSION, MAIN_INVITE_CODE, UNTRUST_USER_IDS, UNTRUST_ROLE_IDS } from '../config/security.js';

const VERSION_KEY = 'securityCleanupVersion';

/** Deletes every invite of the server except the main one. Returns how many were deleted. */
export async function purgeInvites(guild, keep = [MAIN_INVITE_CODE]) {
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        logger.warn(`Invite cleanup skipped in ${guild.name}: the bot needs Manage Server.`);
        return 0;
    }
    const invites = await guild.invites.fetch().catch(() => null);
    let deleted = 0;
    for (const invite of invites?.values() || []) {
        if (keep.includes(invite.code)) continue;
        if (await invite.delete('Only the main invite link is kept (owner request)').then(() => true).catch(() => false)) deleted += 1;
    }
    return deleted;
}

/** Removes the listed members and roles from the trusted list. Returns `{ users, roles }` removed. */
export async function untrust(client, guildId, config, { userIds = UNTRUST_USER_IDS, roleIds = UNTRUST_ROLE_IDS } = {}) {
    const users = Array.isArray(config?.antiNukeTrustedUsers) ? config.antiNukeTrustedUsers : [];
    const roles = Array.isArray(config?.antiNukeTrustedRoles) ? config.antiNukeTrustedRoles : [];
    const keptUsers = users.filter((id) => !userIds.includes(id));
    const keptRoles = roles.filter((id) => !roleIds.includes(id));
    const removed = { users: users.length - keptUsers.length, roles: roles.length - keptRoles.length };
    if (removed.users || removed.roles) {
        await updateGuildConfig(client, guildId, { antiNukeTrustedUsers: keptUsers, antiNukeTrustedRoles: keptRoles });
    }
    return removed;
}

/** Runs the cleanup once per CLEANUP_VERSION for the server. */
export async function runSecurityCleanup(client, guild) {
    const config = await getGuildConfig(client, guild.id).catch(() => null);
    if (!config || config[VERSION_KEY] === CLEANUP_VERSION) return { skipped: true };
    const invitesDeleted = await purgeInvites(guild);
    const removed = await untrust(client, guild.id, config);
    await updateGuildConfig(client, guild.id, { [VERSION_KEY]: CLEANUP_VERSION });
    return { skipped: false, invitesDeleted, ...removed };
}
