// traderRoleService.js — the trader role (`💼 تاجر`) sold in the CC store (item `trader_role`).
// The owner asked the bot to make it: on startup it is found (by its saved ID, else by its name) or,
// the first time only, created with no permissions just above the Level 100 role. Once it was made,
// it is never made again: if the owner deletes it, it is only reported as missing (the bot doesn't
// recreate roles the owner removed). Its ID is saved in the guild config as `traderRoleId`.
// Our server only (src/config/homeGuild.js): src/events/ready.js calls it for that server alone.

import { traderRoleSettings } from '../../config/store/ccStoreItems.js';
import { getGuildConfig, updateGuildConfig } from '../config/guildConfig.js';
import { getLevelingConfig } from '../leveling/leveling.js';
import { LEVEL_TIERS } from '../leveling/levelTierRoles.js';
import { logger } from '../../utils/logger.js';

const ID_KEY = 'traderRoleId';
const CREATED_KEY = 'traderRoleCreated';

/** The Level role the trader role sits above (its saved reward, else a role with its name). */
async function findLevelRole(client, guild, roles, settings) {
    const rewards = (await getLevelingConfig(client, guild.id).catch(() => null))?.roleRewards || {};
    const tier = LEVEL_TIERS.find((entry) => entry.level === settings.aboveLevel);
    return roles.get(rewards[settings.aboveLevel])
        || (tier && [...roles.values()].find((role) => role.name === tier.name && !role.managed))
        || null;
}

/** The trader role of the guild, or null when there is none. */
export async function getTraderRole(client, guild) {
    const config = await getGuildConfig(client, guild.id).catch(() => null);
    const savedId = config?.[ID_KEY];
    if (savedId) {
        const role = guild.roles.cache.get(savedId) || await guild.roles.fetch(savedId).catch(() => null);
        if (role) return role;
    }
    return [...guild.roles.cache.values()].find((role) => role.name === traderRoleSettings.name && !role.managed) || null;
}

/**
 * Finds the trader role, or creates it the first time. Returns `{ status, roleId }` with status one of:
 * found, created, created-unplaced (made, but it couldn't be moved above the Level role),
 * deleted (made before and removed since: not made again), no-level-role (nothing to put it above).
 */
export async function ensureTraderRole(client, guild, settings = traderRoleSettings) {
    const roles = await guild.roles.fetch();
    const config = await getGuildConfig(client, guild.id);
    const saved = config?.[ID_KEY] && roles.get(config[ID_KEY]);
    const existing = saved || [...roles.values()].find((role) => role.name === settings.name && !role.managed);
    if (existing) {
        if (config?.[ID_KEY] !== existing.id) await updateGuildConfig(client, guild.id, { [ID_KEY]: existing.id, [CREATED_KEY]: true });
        return { status: 'found', roleId: existing.id };
    }
    if (config?.[CREATED_KEY]) {
        logger.warn(`The trader role was deleted in ${guild.name}; it is not made again.`);
        return { status: 'deleted', roleId: null };
    }
    const levelRole = await findLevelRole(client, guild, roles, settings);
    if (!levelRole) return { status: 'no-level-role', roleId: null };

    const role = await guild.roles.create({
        name: settings.name,
        colors: { primaryColor: settings.color },
        permissions: [],
        hoist: false,
        mentionable: false,
        reason: 'CC store: the trader role (asked by the owner)',
    });
    await updateGuildConfig(client, guild.id, { [ID_KEY]: role.id, [CREATED_KEY]: true });
    const placed = await role.setPosition(levelRole.position + 1).then(() => true).catch((error) => {
        logger.warn(`Could not move the trader role above ${levelRole.name} in ${guild.name}: ${error.message}`);
        return false;
    });
    logger.info(`Created the trader role in ${guild.name}${placed ? ` above ${levelRole.name}` : ''}`);
    return { status: placed ? 'created' : 'created-unplaced', roleId: role.id };
}
