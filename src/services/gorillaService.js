import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

const GT_STATUS_URL  = 'https://status.gorilla.sc/api/v2/status.json';
const STEAM_URL      = 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1533390';
const PLAYFAB_TITLE  = '63FDD';
const PLAYFAB_BASE   = `https://${PLAYFAB_TITLE}.playfabapi.com`;
const REGIONS        = ['US', 'EU', 'USW', 'AS', 'AU', 'BR', 'JP'];

const STATUS_CONFIG = {
    none:     { color: 0x57F287, emoji: '🟢', label: 'All Systems Operational' },
    minor:    { color: 0xFEE75C, emoji: '🟡', label: 'Minor Service Disruption' },
    major:    { color: 0xE67E22, emoji: '🟠', label: 'Partial System Outage' },
    critical: { color: 0xED4245, emoji: '🔴', label: 'Major System Outage' },
};

// In-memory PlayFab session token cache (valid ~24h, refresh after 23h)
let _pfToken = null;
let _pfTokenExpiry = 0;

async function getPlayFabToken(botId) {
    if (_pfToken && Date.now() < _pfTokenExpiry) return _pfToken;
    try {
        const res = await fetch(`${PLAYFAB_BASE}/Client/LoginWithCustomID`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ TitleId: PLAYFAB_TITLE, CustomId: `gt-status-bot-${botId}`, CreateAccount: true }),
        });
        const data = await res.json();
        _pfToken = data.data?.SessionTicket ?? null;
        _pfTokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
        return _pfToken;
    } catch {
        return null;
    }
}

async function getRoomPlayerCount(token, roomCode) {
    const checks = REGIONS.map(async region => {
        try {
            const res = await fetch(`${PLAYFAB_BASE}/Client/GetSharedGroupData`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Authorization': token },
                body: JSON.stringify({ SharedGroupId: roomCode + region, GetMembers: true }),
            });
            const data = await res.json();
            if (data.code === 200 && Array.isArray(data.data?.Members)) {
                return { count: data.data.Members.length, region };
            }
        } catch {}
        return null;
    });

    const results = (await Promise.all(checks)).filter(Boolean);
    if (!results.length) return null;
    return results.reduce((best, r) => (r.count > best.count ? r : best));
}

export async function fetchGorillaStatus() {
    const [statusRes, steamRes] = await Promise.all([
        fetch(GT_STATUS_URL).then(r => r.json()).catch(() => null),
        fetch(STEAM_URL).then(r => r.json()).catch(() => null),
    ]);

    const indicator   = statusRes?.status?.indicator ?? 'none';
    const description = statusRes?.status?.description ?? 'Unknown';
    const steamCount  = steamRes?.response?.player_count ?? null;

    return { indicator, description, steamCount };
}

export async function fetchRoomCounts(botId, roomCodes) {
    if (!roomCodes?.length) return [];
    const token = await getPlayFabToken(botId);
    if (!token) return roomCodes.map(code => ({ code, count: null, region: null }));

    const results = await Promise.all(
        roomCodes.map(async code => {
            const result = await getRoomPlayerCount(token, code.toUpperCase());
            return { code: code.toUpperCase(), count: result?.count ?? null, region: result?.region ?? null };
        })
    );
    return results;
}

export function buildStatusEmbed({ indicator, description, steamCount }, roomResults = []) {
    const cfg = STATUS_CONFIG[indicator] ?? STATUS_CONFIG.none;

    const embed = new EmbedBuilder()
        .setColor(cfg.color)
        .setTitle('🦍 Gorilla Tag — Server Status')
        .addFields(
            { name: 'Status', value: `${cfg.emoji} **${description}**`, inline: false },
            {
                name: '🎮 Steam Players Online',
                value: steamCount != null ? `**${steamCount.toLocaleString()}**` : 'Unavailable',
                inline: true,
            },
        )
        .setFooter({ text: 'Updates every 5 minutes • status.gorilla.sc' })
        .setTimestamp();

    if (roomResults.length) {
        const lines = roomResults.map(r => {
            if (r.count === null) return `\`${r.code}\` — Unavailable`;
            const bar = '█'.repeat(Math.min(r.count, 10)) + '░'.repeat(Math.max(0, 10 - r.count));
            return `\`${r.code}\` ${r.region ? `(${r.region})` : ''} — **${r.count}** player${r.count !== 1 ? 's' : ''}\n${bar}`;
        });
        embed.addFields({ name: '🏠 Room Player Counts', value: lines.join('\n\n'), inline: false });
    }

    return embed;
}

export async function checkAndUpdateGorillaStatus(client) {
    try {
        const guilds = client.guilds.cache;
        if (!guilds.size) return;

        const baseStatus = await fetchGorillaStatus();

        for (const [guildId] of guilds) {
            const data = await client.db.get(`gorilla:${guildId}`);
            if (!data?.channelId) continue;

            try {
                const channel = await client.channels.fetch(data.channelId).catch(() => null);
                if (!channel) continue;

                const roomResults = await fetchRoomCounts(client.user.id, data.rooms ?? []);
                const embed = buildStatusEmbed(baseStatus, roomResults);

                if (data.messageId) {
                    const msg = await channel.messages.fetch(data.messageId).catch(() => null);
                    if (msg) {
                        await msg.edit({ embeds: [embed] });

                        if (data.lastIndicator && data.lastIndicator !== baseStatus.indicator && baseStatus.indicator !== 'none') {
                            const cfg = STATUS_CONFIG[baseStatus.indicator];
                            await channel.send({ content: `${cfg.emoji} **Gorilla Tag status changed:** ${baseStatus.description}` });
                        }

                        await client.db.set(`gorilla:${guildId}`, { ...data, lastIndicator: baseStatus.indicator });
                        continue;
                    }
                }

                const msg = await channel.send({ embeds: [embed] });
                await client.db.set(`gorilla:${guildId}`, { ...data, messageId: msg.id, lastIndicator: baseStatus.indicator });
            } catch (err) {
                logger.warn(`Gorilla status update failed for guild ${guildId}: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error('checkAndUpdateGorillaStatus error:', err);
    }
}
