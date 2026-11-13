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
        return { groups: [], live: { channelId: null, messageId: null } };
    }
    const groups = Array.isArray(musicStatus.groups) ? musicStatus.groups : [];
    const live = musicStatus.live && typeof musicStatus.live === 'object'
        ? { channelId: musicStatus.live.channelId || null, messageId: musicStatus.live.messageId || null }
        : { channelId: null, messageId: null };
    return { groups, live };
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
    const { groups } = config;

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

/* ============================================================
 * Live status auto-refresh
 * ============================================================ */

const LIVE_REFRESH_INTERVAL_MS = 30 * 1000; // 30 detik

const EMOJI_AVAILABLE = '🟢';
const EMOJI_IN_USE = '🔴';

/**
 * Simpan referensi pesan live status untuk guild tertentu.
 */
export const setLiveMessage = wrapServiceBoundary(async function setLiveMessage(client, guildId, channelId, messageId) {
    await patchGuildConfig(client, guildId, {
        musicStatus: { live: { channelId, messageId } }
    });
    return { channelId, messageId };
}, {
    service: 'musicStatusService',
    operation: 'setLiveMessage',
    message: 'Failed to save live status message reference',
    userMessage: 'Failed to enable live status. Please try again.',
});

/**
 * Hapus referensi pesan live status (hentikan auto-refresh).
 */
export const clearLiveMessage = wrapServiceBoundary(async function clearLiveMessage(client, guildId) {
    await patchGuildConfig(client, guildId, {
        musicStatus: { live: { channelId: null, messageId: null } }
    });
}, {
    service: 'musicStatusService',
    operation: 'clearLiveMessage',
    message: 'Failed to clear live status message reference',
    userMessage: 'Failed to disable live status. Please try again.',
});

/**
 * Mulai interval global yang meng-update semua pesan live status di semua guild.
 * Hanya satu interval per client (dijaga via client.musicStatusLiveTimer).
 */
export function startLiveStatusUpdater(client) {
    if (client.musicStatusLiveTimer) {
        return; // sudah berjalan
    }

    client.musicStatusLiveTimer = setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            try {
                const config = await getMusicStatusConfig(client, guild.id);
                const { channelId, messageId } = config.live;

                if (!channelId || !messageId) continue;

                const channel = guild.channels.cache.get(channelId);
                if (!channel) continue;

                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (!message) continue;

                const snapshot = await buildStatusSnapshot(guild, config);
                // buildStatusEmbed ada di command layer; di sini kita build embed manual atau
                // import dari command. Untuk menghindari circular dependency, kita gunakan helper
                // yang di-import secara dinamis jika diperlukan. Namun karena embed builder
                // murni, kita pindahkan ke service.
                const embed = buildLiveStatusEmbed(snapshot, guild.name);
                await message.edit({ embeds: [embed] }).catch(() => {});
            } catch (err) {
                logger.debug(`Live status update failed for guild ${guild.id}: ${err.message}`);
            }
        }
    }, LIVE_REFRESH_INTERVAL_MS);

    logger.info(`Live status updater started (interval ${LIVE_REFRESH_INTERVAL_MS / 1000}s)`);
}

/**
 * Builder embed untuk live status (mirip buildStatusEmbed di command,
 * tapi dengan footer "diperbarui otomatis").
 */
function truncateStr(str, max) {
    const s = String(str || '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function buildLiveStatusEmbed(snapshot, guildName) {
    const { groups, availableCount, inUseCount } = snapshot;
    const total = availableCount + inUseCount;

    const lines = [];
    lines.push(`${EMOJI_AVAILABLE} **Tersedia** · ${availableCount}`);
    lines.push(`${EMOJI_IN_USE} **Sedang digunakan** · ${inUseCount}`);
    lines.push('');

    if (groups.length === 0) {
        lines.push('Belum ada grup bot musik yang dikonfigurasi.');
        lines.push('Gunakan `/musicstatus group add` untuk membuat grup pertama.');
    }

    for (const group of groups) {
        lines.push('——————————');
        lines.push(`**${group.name}**`);

        if (group.bots.length === 0) {
            lines.push('_Belum ada bot di grup ini._');
            continue;
        }

        for (const bot of group.bots) {
            const statusEmoji = bot.inVoice ? EMOJI_IN_USE : EMOJI_AVAILABLE;
            const statusLabel = bot.inVoice ? 'digunakan' : 'Tersedia';
            lines.push(`${statusEmoji} **${truncateStr(bot.displayName, 40)}** · ${statusLabel}`);

            if (bot.inVoice) {
                const channel = bot.voiceChannelName
                    ? `🔊 ${truncateStr(bot.voiceChannelName, 50)}`
                    : '—';
                lines.push(`└ ${channel}`);
            } else {
                lines.push('└ Belum terhubung ke voice');
            }

            lines.push('');
        }
    }

    const description = lines.join('\n');
    const updatedAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    return {
        title: `STATUS MUSIC ${guildName.toUpperCase()}`,
        description,
        color: 0x2B2D31,
        footer: total > 0
            ? { text: `Total ${total} bot musik · diperbarui ${updatedAt}` }
            : { text: `Diperbarui ${updatedAt}` },
        timestamp: new Date().toISOString(),
    };
}
