import { logger } from '../../utils/logger.js';
import { VOICE_XP } from '../../config/voiceXp.js';
import { getLevelingConfig } from './leveling.js';
import { addXp } from './xpSystem.js';

// Voice XP and `top voice`: once a minute (cron in app.js) every member in voice who is talking-ready
// and not alone gets a minute counted and XP into their normal level (level-ups are announced like chat
// ones). Minutes are saved in one key per server ({ userId: minutes }), like the chat counts.
export const voiceMinutesKey = (guildId) => `guild:${guildId}:voiceminutes`;

let ticking = false;

const isDeafened = (voice) => Boolean(voice?.selfDeaf || voice?.serverDeaf);
// `suppress` is a stage listener who can't speak.
export const isMuted = (voice) => Boolean(voice?.selfMute || voice?.serverMute || voice?.suppress || isDeafened(voice));

/**
 * The members of a voice channel who earn this minute: not bots, not muted/deafened, and with at least
 * one other member in the channel who can hear them. Nobody earns in the server's AFK channel.
 */
export function earningMembers(channel, { afkChannelId = null } = {}) {
    if (!channel?.members || channel.id === afkChannelId) return [];
    const humans = [...channel.members.values()].filter((member) => !member.user?.bot);
    const listeners = humans.filter((member) => !isDeafened(member.voice));
    return humans.filter((member) => !isMuted(member.voice) && listeners.some((other) => other.id !== member.id));
}

export function rollVoiceXp(config = {}, random = Math.random) {
    const min = Math.max(1, VOICE_XP.perMinute.min);
    const max = Math.max(min, VOICE_XP.perMinute.max);
    const xp = Math.floor(random() * (max - min + 1)) + min;
    return config.xpMultiplier > 1 ? Math.floor(xp * config.xpMultiplier) : xp;
}

async function addVoiceMinutes(client, guildId, userIds) {
    const stored = (await client.db.get(voiceMinutesKey(guildId), {})) || {};
    for (const userId of userIds) stored[userId] = (stored[userId] || 0) + 1;
    await client.db.set(voiceMinutesKey(guildId), stored);
}

export async function getVoiceMinutes(client, guildId) {
    return { ...((await client.db.get(voiceMinutesKey(guildId), {})) || {}) };
}

/** The members with the most voice minutes, highest first: [{ userId, minutes, rank }]. */
export function rankVoiceMinutes(minutes, isMember = () => true) {
    return Object.entries(minutes)
        .filter(([userId, total]) => total > 0 && isMember(userId))
        .sort((a, b) => b[1] - a[1])
        .map(([userId, total], index) => ({ userId, minutes: total, rank: index + 1 }));
}

async function tickGuild(client, guild) {
    const earners = [];
    for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased?.() || channel.members.size < 2) continue;
        for (const member of earningMembers(channel, { afkChannelId: guild.afkChannelId })) earners.push({ member, channelId: channel.id });
    }
    if (!earners.length) return;

    await addVoiceMinutes(client, guild.id, earners.map(({ member }) => member.id));

    const config = await getLevelingConfig(client, guild.id);
    if (!config?.enabled) return;
    for (const { member, channelId } of earners) {
        if (config.ignoredChannels?.includes(channelId)) continue;
        if (config.blacklistedUsers?.includes(member.id)) continue;
        if (config.ignoredRoles?.some((roleId) => member.roles.cache.has(roleId))) continue;
        await addXp(client, guild, member, rollVoiceXp(config), { fromVoice: true })
            .catch((error) => logger.error(`Failed to give voice XP to ${member.id}:`, error));
    }
}

/** Runs every minute: counts a voice minute and gives voice XP to everyone who earns it. */
export async function tickVoiceActivity(client) {
    // A slow tick (big server, slow database) must not overlap the next one and count a minute twice.
    if (ticking) return;
    ticking = true;
    try {
        for (const guild of client.guilds.cache.values()) {
            await tickGuild(client, guild).catch((error) => logger.error(`Voice XP tick failed in ${guild.id}:`, error));
        }
    } finally {
        ticking = false;
    }
}
