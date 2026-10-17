import { Events, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import type { ColorResolvable } from 'discord.js';
import { getColor, botConfig } from '../config/bot.js';
import { getWelcomeConfig, getUserApplications, deleteApplication } from '../utils/database.js';
import { formatWelcomeMessage } from '../utils/welcome.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { getServerCounters, updateCounter } from '../services/serverstatsService.js';
import { getGuildBirthdays, deleteBirthday } from '../utils/database.js';
import { deleteUserLevelData } from '../services/leveling/leveling.js';
import { logger } from '../utils/logger.js';
import type { BirthdayEntry } from '../utils/database.js';
import type { BotEvent } from '../types/index.js';

export default {
  name: Events.GuildMemberRemove,
  once: false,
  
  async execute(member) {
    try {
        const { guild, user } = member;
        
        const welcomeConfig = await getWelcomeConfig(member.client, guild.id);
        
        const goodbyeChannelId = welcomeConfig?.goodbyeChannelId;

        if (welcomeConfig?.goodbyeEnabled && goodbyeChannelId) {
            const channel = guild.channels.cache.get(goodbyeChannelId);
            if (channel?.isTextBased?.()) {
                const me = guild.members.me;
                const permissions = me ? channel.permissionsFor(me) : null;
                if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                    return;
                }

                const formatData = { user, guild, member };
                const goodbyeMessage = formatWelcomeMessage(
                    welcomeConfig.leaveMessage || welcomeConfig.leaveEmbed?.description || botConfig.welcome?.defaultGoodbyeMessage || '{user} hat den Server verlassen.',
                    formatData
                );

                const embedTitle = formatWelcomeMessage(
                    welcomeConfig.leaveEmbed?.title || '👋 Auf Wiedersehen',
                    formatData
                );
                const embedFooter = welcomeConfig.leaveEmbed?.footer
                    ? formatWelcomeMessage(welcomeConfig.leaveEmbed.footer, formatData)
                    : `Tschüss von ${guild.name}!`;

                const canEmbed = permissions.has(PermissionFlagsBits.EmbedLinks);

                if (!canEmbed) {
                    await channel.send({
                        content: welcomeConfig?.goodbyePing ? `<@${user.id}> ${goodbyeMessage}` : goodbyeMessage,
                        allowedMentions: welcomeConfig?.goodbyePing ? { users: [user.id] } : { parse: [] }
                    });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle(embedTitle)
                        .setDescription(goodbyeMessage)
                        .setColor((welcomeConfig.leaveEmbed?.color || getColor('error')) as ColorResolvable)
                        .setThumbnail(user.displayAvatarURL())
                        .addFields(
                            { name: 'Nutzer', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Mitglieder', value: guild.memberCount.toString(), inline: true }
                        )
                        .setTimestamp()
                        .setFooter({ text: embedFooter });

                    // Stored embed config may carry an image string or object (not part of WelcomeEmbedConfig).
                    const leaveEmbedImage = welcomeConfig.leaveEmbed?.image as string | { url?: string } | undefined;
                    if (typeof leaveEmbedImage === 'string') {
                        embed.setImage(leaveEmbedImage);
                    } else if (leaveEmbedImage?.url) {
                        embed.setImage(leaveEmbedImage.url);
                    }

                    await channel.send({
                        content: welcomeConfig?.goodbyePing ? `<@${user.id}>` : undefined,
                        allowedMentions: welcomeConfig?.goodbyePing ? { users: [user.id] } : { parse: [] },
                        embeds: [embed]
                    });
                }
            }
        }

        try {
            await logEvent({
                client: member.client,
                guildId: guild.id,
                eventType: EVENT_TYPES.MEMBER_LEAVE,
                data: {
                    title: 'Nutzer hat den Server verlassen',
                    lines: [
                        `**Nutzer:** ${user.toString()} (${user.tag})`,
                        `**ID:** \`${user.id}\``,
                        `**Beigetreten:** <t:${Math.floor((member.joinedTimestamp || Date.now()) / 1000)}:R>`,
                        `**Mitglieder:** ${guild.memberCount}`,
                    ],
                    quoted: false,
                    thumbnail: user.displayAvatarURL(),
                    userId: user.id,
                }
            });
        } catch (error) {
            logger.debug('Error logging member leave:', error);
        }

        try {
            const counters = await getServerCounters(member.client, guild.id);
            for (const counter of counters) {
                if (counter && counter.type && counter.channelId && counter.enabled !== false) {
                    await updateCounter(member.client, guild, counter);
                }
            }
        } catch (error) {
            logger.debug('Error updating counters on member leave:', error);
        }

        try {
            const birthdays = await getGuildBirthdays(member.client, guild.id);
            if (birthdays[user.id]) {
                const backupKey = `guild:${guild.id}:birthdays:left`;
                const backup = (await member.client.db.get<Record<string, BirthdayEntry>>(backupKey)) || {};
                backup[user.id] = birthdays[user.id];
                await member.client.db.set(backupKey, backup);
                await deleteBirthday(member.client, guild.id, user.id);
                logger.debug(`Birthday backed up and removed for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error handling birthday on member leave:', error);
        }

        try {
            const userApplications = await getUserApplications(member.client, guild.id, user.id);
            if (userApplications && userApplications.length > 0) {
                for (const app of userApplications) {
                    await deleteApplication(member.client, guild.id, app.id, user.id);
                }
                logger.debug(`Removed ${userApplications.length} applications for user ${user.id} in guild ${guild.id}`);
            }
        } catch (error) {
            logger.debug('Error handling applications on member leave:', error);
        }

        try {
            await deleteUserLevelData(member.client, guild.id, user.id);
            logger.debug(`Removed leveling data for user ${user.id} in guild ${guild.id}`);
        } catch (error) {
            logger.debug('Error handling leveling data on member leave:', error);
        }
        
    } catch (error) {
        logger.error('Error in guildMemberRemove event:', error);
    }
  }
} satisfies BotEvent<Events.GuildMemberRemove>;