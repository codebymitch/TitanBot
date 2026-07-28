import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getFromDb, setInDb } from '../utils/database/wrapper.js';
import { ModerationService } from './moderationService.js';
import { logger } from '../utils/logger.js';

const getHoneypotKey = (guildId) => `guild:${guildId}:honeypot`;
const HONEYPOT_IMAGE = 'https://www.dropbox.com/scl/fi/ilr20lv5u3mlv7ebr1cbz/honey-pot.png?rlkey=9txrk7gvymb5vpi60q4rde697&st=juj7ew12&dl=1';

export async function getHoneypotConfig(guildId) {
    try {
        const data = await getFromDb(getHoneypotKey(guildId), null);
        return data || { channelId: null, enabled: false, banCount: 0, method: 'ban' };
    } catch (err) {
        logger.error(`Failed to get honeypot config for ${guildId}:`, err);
        return { channelId: null, enabled: false, banCount: 0, method: 'ban' };
    }
}

export async function setHoneypotConfig(guildId, config) {
    try {
        await setInDb(getHoneypotKey(guildId), config);
        return true;
    } catch (err) {
        logger.error(`Failed to set honeypot config for ${guildId}:`, err);
        return false;
    }
}

export function buildHoneypotWarningEmbed(method = 'ban') {
    return new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('DO NOT SEND MESSAGES IN THIS CHANNEL')
        .setDescription(
            'This channel is used to catch spam bots and scammers.\n' +
            `Any messages sent here will result in a **${method}**.`,
        )
        .setThumbnail(HONEYPOT_IMAGE);
}

export function buildHoneypotComponents(banCount = 0, method = 'ban') {
    const label = method === 'kick' ? `🍯 Kicks: ${banCount}` : `🍯 Bans: ${banCount}`;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('honeypot_action_count')
            .setLabel(label)
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
    );
}

export async function refreshHoneypotMessage(client, guildId) {
    try {
        const config = await getHoneypotConfig(guildId);
        if (!config.channelId || !config.messageId) return;

        const channel = client.channels.cache.get(config.channelId);
        if (!channel) return;

        const msg = await channel.messages.fetch(config.messageId).catch(() => null);
        if (!msg) return;

        await msg.edit({
            embeds: [buildHoneypotWarningEmbed(config.method || 'ban')],
            components: [buildHoneypotComponents(config.banCount, config.method || 'ban')],
        });
    } catch (err) {
        logger.error(`Honeypot: failed to refresh warning message in guild ${guildId}:`, err);
    }
}

export async function handleHoneypotMessage(message, client) {
    const { guild, author } = message;

    await message.delete().catch(() => null);

    const botMember = guild.members.me;
    const config = await getHoneypotConfig(guild.id);
    const method = config.method || 'ban';

    try {
        if (method === 'kick') {
            const member = await guild.members.fetch(author.id).catch(() => null);
            if (member) {
                await ModerationService.kickUser({
                    guild,
                    member,
                    moderator: botMember,
                    reason: 'Honeypot triggered — sent a message in a protected channel.',
                });
            }
            logger.info(`Honeypot: kicked ${author.tag} (${author.id}) in guild ${guild.id}`);
        } else {
            await ModerationService.banUser({
                guild,
                user: author,
                moderator: botMember,
                reason: 'Honeypot triggered — sent a message in a protected channel.',
                deleteDays: 1,
            });
            logger.info(`Honeypot: banned ${author.tag} (${author.id}) in guild ${guild.id}`);
        }

        const newCount = (config.banCount || 0) + 1;
        await setHoneypotConfig(guild.id, { ...config, banCount: newCount });
        await refreshHoneypotMessage(client, guild.id);
    } catch (err) {
        logger.error(`Honeypot: failed to ${method} ${author.tag} in guild ${guild.id}:`, err);
    }
}
