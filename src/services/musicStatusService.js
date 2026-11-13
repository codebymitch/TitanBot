// musicStatusService.js
// Manages the list of music bots and groups used by the /musicstatus command.

import { getGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import { createError, ErrorTypes, wrapServiceBoundary } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

const GROUP_ID_PREFIX = 'ms_group_';
const MAX_GROUPS = 10;
const MAX_BOTS_PER_GROUP = 25;
const MAX_GROUP_NAME_LENGTH = 50;

function generateGroupId() {
    return `${GROUP_ID_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeGroupName(name) {
    return String(name || '').trim().slice(0, MAX_GROUP_NAME_LENGTH);
}

function extractConfig(config) {
    const musicStatus = config?.musicStatus;
    if (!musicStatus || typeof musicStatus !== 'object') {
        return { groups: [] };
    }
    const groups = Array.isArray(musicStatus.groups) ? musicStatus.groups : [];
    return { groups };
}

/**
 * Fetch the full music status config for a guild.
 * @returns {Promise<{ groups: Array<{ id: string, name: string, bots: Array<{ id: string }> }> }>}
 */
export const getMusicStatusConfig = wrapServiceBoundary(async function getMusicStatusConfig(client, guildId) {
    const config = await getGuildConfig(client, guildId);
    return extractConfig(config);
}, {
    service: 'musicStatusService',
    operation: 'getMusicStatusConfig',
    message: 'Failed to load music status configuration',
    userMessage: 'Failed to load music bot status configuration.',
});

async function saveMusicStatusConfig(client, guildId, groups) {
    await patchGuildConfig(client, guildId, { musicStatus: { groups } });
}

/**
 * Create a new music bot group.
 */
export const createGroup = wrapServiceBoundary(async function createGroup(client, guildId, rawName) {
    const name = sanitizeGroupName(rawName);
    if (!name) {
        throw createError('Group name cannot be empty', ErrorTypes.VALIDATION, 'Please provide a group name.');
    }

    const { groups } = await getMusicStatusConfig(client, guildId);
    if (groups.length >= MAX_GROUPS) {
        throw createError('Too many groups', ErrorTypes.VALIDATION, `You can only create up to ${MAX_GROUPS} groups.`);
    }

    const newGroup = {
        id: generateGroupId(),
        name,
        bots: [],
    };

    const updatedGroups = [...groups, newGroup];
    await saveMusicStatusConfig(client, guildId, updatedGroups);

    logger.info(`Created music status group "${name}" in guild ${guildId}`);
    return newGroup;
}, {
    service: 'musicStatusService',
    operation: 'createGroup',
    message: 'Failed to create music bot group',
    userMessage: 'Failed to create the music bot group.',
});

/**
 * Delete a music bot group by id.
 */
export const deleteGroup = wrapServiceBoundary(async function deleteGroup(client, guildId, groupId) {
    const { groups } = await getMusicStatusConfig(client, guildId);
    const exists = groups.some(g => g.id === groupId);
    if (!exists) {
        throw createError('Group not found', ErrorTypes.VALIDATION, 'That group does not exist.');
    }

    const updatedGroups = groups.filter(g => g.id !== groupId);
    await saveMusicStatusConfig(client, guildId, updatedGroups);

    logger.info(`Deleted music status group ${groupId} in guild ${guildId}`);
    return true;
}, {
    service: 'musicStatusService',
    operation: 'deleteGroup',
    message: 'Failed to delete music bot group',
    userMessage: 'Failed to delete the music bot group.',
});

/**
 * Rename an existing group.
 */
export const renameGroup = wrapServiceBoundary(async function renameGroup(client, guildId, groupId, rawName) {
    const name = sanitizeGroupName(rawName);
    if (!name) {
        throw createError('Group name cannot be empty', ErrorTypes.VALIDATION, 'Please provide a group name.');
    }

    const { groups } = await getMusicStatusConfig(client, guildId);
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        throw createError('Group not found', ErrorTypes.VALIDATION, 'That group does not exist.');
    }

    group.name = name;
    await saveMusicStatusConfig(client, guildId, groups);
    return group;
}, {
    service: 'musicStatusService',
    operation: 'renameGroup',
    message: 'Failed to rename music bot group',
    userMessage: 'Failed to rename the music bot group.',
});

/**
 * Add a bot to a group.
 */
export const addBot = wrapServiceBoundary(async function addBot(client, guildId, groupId, botId) {
    const id = String(botId || '').trim();
    if (!/^\d{17,19}$/.test(id)) {
        throw createError('Invalid bot ID', ErrorTypes.VALIDATION, 'Please provide a valid bot user ID.');
    }

    const { groups } = await getMusicStatusConfig(client, guildId);
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        throw createError('Group not found', ErrorTypes.VALIDATION, 'That group does not exist.');
    }

    if (group.bots.some(b => b.id === id)) {
        throw createError('Bot already in group', ErrorTypes.VALIDATION, 'That bot is already in this group.');
    }

    if (group.bots.length >= MAX_BOTS_PER_GROUP) {
        throw createError('Too many bots in group', ErrorTypes.VALIDATION, `A group can hold up to ${MAX_BOTS_PER_GROUP} bots.`);
    }

    group.bots.push({ id });
    await saveMusicStatusConfig(client, guildId, groups);

    logger.info(`Added bot ${id} to group ${groupId} in guild ${guildId}`);
    return group;
}, {
    service: 'musicStatusService',
    operation: 'addBot',
    message: 'Failed to add music bot',
    userMessage: 'Failed to add the music bot to the group.',
});

/**
 * Remove a bot from a group.
 */
export const removeBot = wrapServiceBoundary(async function removeBot(client, guildId, groupId, botId) {
    const id = String(botId || '').trim();
    const { groups } = await getMusicStatusConfig(client, guildId);
    const group = groups.find(g => g.id === groupId);
    if (!group) {
        throw createError('Group not found', ErrorTypes.VALIDATION, 'That group does not exist.');
    }

    const initialLength = group.bots.length;
    group.bots = group.bots.filter(b => b.id !== id);
    if (group.bots.length === initialLength) {
        throw createError('Bot not found in group', ErrorTypes.VALIDATION, 'That bot is not in this group.');
    }

    await saveMusicStatusConfig(client, guildId, groups);

    logger.info(`Removed bot ${id} from group ${groupId} in guild ${guildId}`);
    return group;
}, {
    service: 'musicStatusService',
    operation: 'removeBot',
    message: 'Failed to remove music bot',
    userMessage: 'Failed to remove the music bot from the group.',
});

/**
 * Build the runtime status snapshot for every registered bot.
 * Returns a list of groups with enriched bot data (display name, in-voice status, current activity).
 */
export async function buildStatusSnapshot(guild, config) {
    const { groups } = extractConfig(config);

    const result = [];
    let availableCount = 0;
    let inUseCount = 0;

    for (const group of groups) {
        const bots = [];

        for (const botEntry of group.bots) {
            let member = guild.members.cache.get(botEntry.id);
            if (!member) {
                try {
                    member = await guild.members.fetch(botEntry.id).catch(() => null);
                } catch {
                    member = null;
                }
            }

            const displayName = member?.displayName || member?.user?.username || `Unknown Bot (${botEntry.id})`;
            const inVoice = !!member?.voice?.channel;
            const voiceChannel = member?.voice?.channel || null;
            const activity = extractNowPlaying(member);

            if (inVoice) {
                inUseCount += 1;
            } else {
                availableCount += 1;
            }

            bots.push({
                id: botEntry.id,
                displayName,
                inVoice,
                voiceChannelName: voiceChannel?.name || null,
                nowPlaying: activity,
                user: member?.user || null,
            });
        }

        result.push({
            id: group.id,
            name: group.name,
            bots,
        });
    }

    return { groups: result, availableCount, inUseCount };
}

/**
 * Try to extract a "now playing" string from a member's presence activities.
 * Music bots usually expose the current track via a "Playing" or "Listening to" activity.
 */
function extractNowPlaying(member) {
    if (!member?.presence?.activities?.length) {
        return null;
    }

    // Prefer custom status (many bots put the track there), then Playing/Listening.
    const custom = member.presence.activities.find(a => a.type === 4); // CUSTOM_STATUS
    if (custom?.state) {
        return custom.state;
    }

    const playable = member.presence.activities.find(a => a.type === 2 || a.type === 0 || a.type === 3);
    if (playable?.name) {
        return playable.details ? `${playable.name} — ${playable.details}` : playable.name;
    }

    return null;
}

export { MAX_GROUPS, MAX_BOTS_PER_GROUP };
