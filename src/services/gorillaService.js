import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

const GT_STATUS_URL = 'https://status.gorilla.sc/api/v2/status.json';
const STEAM_URL     = 'https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=1533390';
const STEAM_NEWS    = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1533390&count=5&maxlength=600&format=json';

const STATUS_CONFIG = {
    none:     { color: 0x57F287, emoji: '🟢', label: 'All Systems Operational' },
    minor:    { color: 0xFEE75C, emoji: '🟡', label: 'Minor Service Disruption' },
    major:    { color: 0xE67E22, emoji: '🟠', label: 'Partial System Outage' },
    critical: { color: 0xED4245, emoji: '🔴', label: 'Major System Outage' },
};

function cleanContent(text) {
    return text
        .replace(/\[([^\]]+)\]/g, '')   // strip BBcode tags like [h1], [b], [url=...]
        .replace(/\s{3,}/g, '\n\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 500);
}

export async function fetchGorillaStatus() {
    const [statusRes, steamRes] = await Promise.all([
        fetch(GT_STATUS_URL).then(r => r.json()).catch(() => null),
        fetch(STEAM_URL).then(r => r.json()).catch(() => null),
    ]);

    return {
        indicator:   statusRes?.status?.indicator   ?? 'none',
        description: statusRes?.status?.description ?? 'Unknown',
        steamCount:  steamRes?.response?.player_count ?? null,
    };
}

export async function fetchPatchNotes(count = 1) {
    const data = await fetch(`${STEAM_NEWS}&count=${count}`)
        .then(r => r.json())
        .catch(() => null);

    const items = data?.appnews?.newsitems ?? [];
    return items.map(item => ({
        gid:     item.gid,
        title:   item.title,
        url:     item.url,
        content: cleanContent(item.contents),
        date:    new Date(item.date * 1000),
        author:  item.author,
    }));
}

export function buildPatchEmbed(note) {
    return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setAuthor({ name: 'Gorilla Tag Update', iconURL: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1533390/header.jpg' })
        .setTitle(note.title)
        .setURL(note.url)
        .setDescription(note.content + (note.content.length >= 500 ? `\n\n[Read more](${note.url})` : ''))
        .setFooter({ text: `Posted by ${note.author} • Steam` })
        .setTimestamp(note.date);
}

export function buildStatusEmbed({ indicator, description, steamCount }) {
    const cfg = STATUS_CONFIG[indicator] ?? STATUS_CONFIG.none;

    return new EmbedBuilder()
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
}

export async function checkAndUpdateGorillaStatus(client) {
    try {
        const guilds = client.guilds.cache;
        if (!guilds.size) return;

        const status = await fetchGorillaStatus();
        const embed  = buildStatusEmbed(status);

        for (const [guildId] of guilds) {
            const data = await client.db.get(`gorilla:${guildId}`);
            if (!data?.channelId) continue;

            try {
                const channel = await client.channels.fetch(data.channelId).catch(() => null);
                if (!channel) continue;

                if (data.messageId) {
                    const msg = await channel.messages.fetch(data.messageId).catch(() => null);
                    if (msg) {
                        await msg.edit({ embeds: [embed] });

                        if (data.lastIndicator && data.lastIndicator !== status.indicator && status.indicator !== 'none') {
                            const cfg = STATUS_CONFIG[status.indicator];
                            await channel.send({ content: `${cfg.emoji} **Gorilla Tag status changed:** ${status.description}` });
                        }

                        await client.db.set(`gorilla:${guildId}`, { ...data, lastIndicator: status.indicator });
                        continue;
                    }
                }

                const msg = await channel.send({ embeds: [embed] });
                await client.db.set(`gorilla:${guildId}`, { ...data, messageId: msg.id, lastIndicator: status.indicator });
            } catch (err) {
                logger.warn(`Gorilla status update failed for guild ${guildId}: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error('checkAndUpdateGorillaStatus error:', err);
    }
}

export async function checkAndPostPatchNotes(client) {
    try {
        const notes = await fetchPatchNotes(1);
        if (!notes.length) return;
        const latest = notes[0];

        for (const [guildId] of client.guilds.cache) {
            const data = await client.db.get(`gorilla:${guildId}`);
            if (!data?.channelId) continue;
            if (data.lastPatchGid === latest.gid) continue;

            try {
                const channel = await client.channels.fetch(data.channelId).catch(() => null);
                if (!channel) continue;

                await channel.send({
                    content: '📢 **New Gorilla Tag Update!**',
                    embeds: [buildPatchEmbed(latest)],
                });

                await client.db.set(`gorilla:${guildId}`, { ...data, lastPatchGid: latest.gid });
            } catch (err) {
                logger.warn(`Gorilla patch note post failed for guild ${guildId}: ${err.message}`);
            }
        }
    } catch (err) {
        logger.error('checkAndPostPatchNotes error:', err);
    }
}
