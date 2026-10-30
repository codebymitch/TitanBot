import { logger } from '../../utils/logger.js';
import { getLevelingConfig, getUserLevelData, listLevelUserIds, saveLevelingConfig } from './leveling.js';

// Roles a level sync never takes away, even if one ends up in roleRewards: the owner wants `media`
// to stay on members exactly as it is when their level role changes.
const KEPT_ROLE_NAMES = new Set(['media']);

/**
 * Which level roles a member at `level` should gain and lose. A member holds only the role of the
 * highest level they reached: reaching Level 10 gives Level 10 and takes Level 5 away. With
 * `removeAbove`, rewards above their level are taken away too, for when an admin lowers someone's level.
 */
export function levelRoleChanges(level, roleRewards = {}, heldRoleIds = new Set(), { removeAbove = false } = {}) {
    const add = [];
    const remove = [];
    const entries = Object.entries(roleRewards)
        .map(([levelStr, roleId]) => [Number(levelStr), roleId])
        .filter(([requiredLevel, roleId]) => Number.isFinite(requiredLevel) && roleId)
        .sort((a, b) => a[0] - b[0]);
    const reached = entries.filter(([requiredLevel]) => level >= requiredLevel);
    const [currentLevel, currentRoleId] = reached[reached.length - 1] || [];

    if (currentRoleId && !heldRoleIds.has(currentRoleId)) add.push({ level: currentLevel, roleId: currentRoleId });
    for (const [requiredLevel, roleId] of entries) {
        if (roleId === currentRoleId || !heldRoleIds.has(roleId) || remove.some((entry) => entry.roleId === roleId)) continue;
        if (requiredLevel <= level || removeAbove) remove.push({ level: requiredLevel, roleId });
    }
    return { add, remove };
}

/**
 * Gives a member the role of the highest level they've reached and takes their older level roles
 * (and, with `removeAbove`, the ones above their level). Returns the IDs of the roles that were added
 * and removed. Never throws.
 */
export async function syncMemberLevelRoles(guild, member, level, roleRewards, { removeAbove = false, reason = 'Level role' } = {}) {
    const result = { added: [], removed: [] };
    if (!member?.roles?.cache || !roleRewards) return result;

    const { add, remove } = levelRoleChanges(level, roleRewards, new Set(member.roles.cache.keys()), { removeAbove });
    const findRole = async (roleId) => guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));

    let hasCurrentRole = add.length === 0;
    for (const { level: requiredLevel, roleId } of add) {
        try {
            const role = await findRole(roleId);
            if (!role) {
                logger.warn(`Role ${roleId} not found for level ${requiredLevel} reward in guild ${guild.id}`);
                continue;
            }
            await member.roles.add(role, `${reason}: reached level ${requiredLevel}`);
            result.added.push(roleId);
            hasCurrentRole = true;
        } catch (error) {
            logger.warn(`Could not give level ${requiredLevel} role to ${member.id} in guild ${guild.id}: ${error.message}`);
        }
    }
    for (const { level: requiredLevel, roleId } of remove) {
        // If the new role couldn't be given, the member keeps their old one rather than ending up with none.
        if (requiredLevel <= level && !hasCurrentRole) continue;
        try {
            const role = await findRole(roleId);
            if (!role || KEPT_ROLE_NAMES.has(role.name)) continue;
            const why = requiredLevel <= level ? `replaced by a higher level role` : `now below level ${requiredLevel}`;
            await member.roles.remove(role, `${reason}: ${why}`);
            result.removed.push(roleId);
        } catch (error) {
            logger.warn(`Could not remove level ${requiredLevel} role from ${member.id} in guild ${guild.id}: ${error.message}`);
        }
    }
    return result;
}

/** Re-checks one member's level roles against their saved level (after an admin change or a rejoin). */
export async function syncMemberLevelRolesFromData(client, guild, member, { removeAbove = false, reason } = {}) {
    try {
        const config = await getLevelingConfig(client, guild.id);
        if (config.enabled === false || !config.roleRewards) return { added: [], removed: [] };
        const levelData = await getUserLevelData(client, guild.id, member.id);
        return await syncMemberLevelRoles(guild, member, levelData.level, config.roleRewards, { removeAbove, reason });
    } catch (error) {
        logger.warn(`Level role sync failed for ${member?.id} in guild ${guild?.id}: ${error.message}`);
        return { added: [], removed: [] };
    }
}

export async function reconcileLevelRoles(client, guildId = null) {
    const summary = {
        scannedGuilds: 0,
        prunedRewardEntries: 0,
        rolesReAwarded: 0,
        rolesRemoved: 0,
        errors: 0,
    };

    const guilds = guildId
        ? [client.guilds.cache.get(guildId)].filter(Boolean)
        : [...client.guilds.cache.values()];

    for (const guild of guilds) {
        summary.scannedGuilds += 1;

        try {
            const cfg = await getLevelingConfig(client, guild.id);
            if (cfg.enabled === false) continue;

            const rewards = { ...(cfg.roleRewards || {}) };
            if (Object.keys(rewards).length === 0) continue;

            let configChanged = false;

            for (const [level, roleId] of Object.entries(rewards)) {
                const role =
                    guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
                if (!role) {
                    delete rewards[level];
                    configChanged = true;
                    summary.prunedRewardEntries += 1;
                    logger.warn(
                        `Removed missing level ${level} reward role ${roleId} from config in guild ${guild.id}`,
                    );
                }
            }

            if (configChanged) {
                cfg.roleRewards = rewards;
                await saveLevelingConfig(client, guild.id, cfg);
            }

            if (Object.keys(rewards).length === 0) continue;

            const userIds = await listLevelUserIds(client, guild.id);

            for (const userId of userIds) {
                const levelData = await getUserLevelData(client, guild.id, userId);
                const member = await guild.members.fetch(userId).catch(() => null);
                if (!member) continue;

                const { added, removed } = await syncMemberLevelRoles(guild, member, levelData.level, rewards, { reason: 'Level role (startup sync)' });
                summary.rolesReAwarded += added.length;
                summary.rolesRemoved += removed.length;
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Level role sync failed for guild ${guild.id}:`, error.message);
        }
    }

    return summary;
}
