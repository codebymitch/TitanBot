import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { t } from '../../../services/i18n.js';

export async function handleList(interaction, client, lang) {
    const guild = interaction.guild;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.noPermsList'))]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters = [];
        const orphanedCounters = [];

        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            if (channel) {
                validCounters.push(counter);
            } else {
                orphanedCounters.push(counter);
                logger.info(`Removing orphaned counter ${counter.id} (type: ${counter.type}, deleted channel: ${counter.channelId}) from guild ${guild.id}`);
            }
        }

        if (orphanedCounters.length > 0) {
            await saveServerCounters(client, guild.id, validCounters);
            logger.info(`Cleaned up ${orphanedCounters.length} orphaned counter(s) from guild ${guild.id}`);
        }

        if (validCounters.length === 0) {
            const embed = createEmbed({
                title: t(lang, 'wolf.cmd.serverstats.listEmptyTitle'),
                description: t(lang, 'wolf.cmd.serverstats.listEmptyDesc'),
                color: getColor('warning')
            });

            embed.addFields({
                name: t(lang, 'wolf.cmd.serverstats.availableTitle'),
                value: t(lang, 'wolf.cmd.serverstats.availableValue'),
                inline: false
            });

            embed.addFields({
                name: t(lang, 'wolf.cmd.serverstats.usageTitle'),
                value: t(lang, 'wolf.cmd.serverstats.usageValue'),
                inline: false
            });

            embed.setFooter({ text: t(lang, 'wolf.cmd.serverstats.listFooter') });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: t(lang, 'wolf.cmd.serverstats.listTitle', { n: validCounters.length }),
            description: t(lang, 'wolf.cmd.serverstats.listDesc'),
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            if (!channel) continue;

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':')
                ? t(lang, 'wolf.cmd.serverstats.statusActive')
                : t(lang, 'wolf.cmd.serverstats.statusNotUpdated');
            const typeDisplay = `${getCounterTypeEmoji(counter.type)} ${getCounterTypeLabel(counter.type)}`;

            embed.addFields({
                name: t(lang, 'wolf.cmd.serverstats.counterField', {
                    emoji: getCounterTypeEmoji(counter.type),
                    n: i + 1,
                    channelName: channel.name,
                }),
                value: t(lang, 'wolf.cmd.serverstats.counterValue', {
                    id: counter.id,
                    typeDisplay,
                    channel,
                    count: currentCount,
                    status,
                    date: new Date(counter.createdAt).toLocaleDateString(),
                }),
                inline: false
            });
        }

        const activeCount = validCounters.filter(c => {
            const channel = guild.channels.cache.get(c.channelId);
            return channel && channel.name.includes(':');
        }).length;

        embed.addFields({
            name: t(lang, 'wolf.cmd.serverstats.statsTitle'),
            value: t(lang, 'wolf.cmd.serverstats.statsValue', {
                total: validCounters.length,
                active: activeCount,
                ts: Math.floor(Date.now() / 1000) + 900,
            }),
            inline: false
        });

        embed.addFields({
            name: t(lang, 'wolf.cmd.serverstats.mgmtTitle'),
            value: t(lang, 'wolf.cmd.serverstats.mgmtValue'),
            inline: false
        });

        embed.setFooter({ text: t(lang, 'wolf.cmd.serverstats.listFooter') });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.listErrorFetch'))]
        }).catch(logger.error);
    }
}

function getCurrentCount(stats, type) {
    switch (type) {
        case "members": return stats.totalCount;
        case "bots": return stats.botCount;
        case "members_only": return stats.humanCount;
        default: return 0;
    }
}
