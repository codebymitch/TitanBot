import { logger } from '../../utils/logger.js';
import { getLevelingConfig, saveLevelingConfig } from './leveling.js';

// Level roles: one role per tier (higher level = higher role).
// Emojis and colours are their own, apart from the staff roles (👑 ⚡ 🛡️ 🔨 🔰): green for the first
// levels, through blue and purple, up to gold at level 100. They carry no permissions, only a colour.
// Each tier is saved in the leveling config's roleRewards, so the level-up message gives the role
// (and names it) and the startup level role sync hands it to members who already passed that level.
// A member only keeps the role of their highest tier: the next tier replaces the previous one.
// The roles are the owner's: the bot never creates, renames, recolours, moves or deletes them.

export const LEVEL_TIERS = [
    { level: 5, name: '🌱 Level 5', color: '#a3e4a1' },
    { level: 10, name: '🍀 Level 10', color: '#27ae60' },
    { level: 15, name: '💧 Level 15', color: '#48dbfb' },
    { level: 20, name: '🌊 Level 20', color: '#2e86de' },
    { level: 30, name: '🔮 Level 30', color: '#8e44ad' },
    { level: 40, name: '🌸 Level 40', color: '#fd79a8' },
    { level: 50, name: '🔥 Level 50', color: '#ff7f50' },
    { level: 75, name: '💎 Level 75', color: '#00d2d3' },
    { level: 100, name: '🌌 Level 100', color: '#ffd700' },
];

// The tier's role: the one saved as its reward (so a renamed role is still found), else one with its name.
function findTierRole(roles, tier, savedRoleId) {
    return (savedRoleId && roles.get(savedRoleId))
        || [...roles.values()].find((role) => role.name === tier.name && !role.managed)
        || null;
}

/**
 * Saves the level roles that exist as the level rewards. The bot never creates, edits, moves or deletes a
 * level role: a missing one is only reported, and it is the owner who makes it.
 */
export async function findLevelTierRoles(client, guild) {
    const summary = { found: 0, missing: [], rewardsSaved: false };
    const roles = await guild.roles.fetch();
    const config = await getLevelingConfig(client, guild.id);
    const rewards = { ...(config.roleRewards || {}) };
    let changed = false;
    for (const tier of LEVEL_TIERS) {
        const role = findTierRole(roles, tier, rewards[tier.level]);
        if (!role) {
            summary.missing.push(tier.name);
            continue;
        }
        summary.found += 1;
        if (rewards[tier.level] === role.id) continue;
        rewards[tier.level] = role.id;
        changed = true;
    }
    if (summary.missing.length) logger.warn(`Level roles missing in ${guild.name} (the bot doesn't create roles): ${summary.missing.join(', ')}`);
    if (changed) {
        await saveLevelingConfig(client, guild.id, { ...config, roleRewards: rewards });
        summary.rewardsSaved = true;
    }
    return summary;
}
