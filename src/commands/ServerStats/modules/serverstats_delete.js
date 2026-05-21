import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { t } from '../../../services/i18n.js';

export async function handleDelete(interaction, client, lang) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.noPermsDelete'))]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.deleteNoneFound'))]
            }).catch(logger.error);
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.deleteNotFound', { id: counterId }))]
            }).catch(logger.error);
            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);
        const typeDisplay = `${getCounterEmoji(counterToDelete.type)} ${getCounterTypeLabel(counterToDelete.type)}`;
        const channelDisplay = channel || t(lang, 'wolf.cmd.serverstats.deletedChannelLabel');

        const embed = createEmbed({
            title: t(lang, 'wolf.cmd.serverstats.deleteConfirmTitle'),
            description: t(lang, 'wolf.cmd.serverstats.deleteConfirmDesc', {
                id: counterToDelete.id,
                typeDisplay,
                channel: channelDisplay,
            }),
            color: getColor('error')
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter-delete:confirm:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel(t(lang, 'wolf.cmd.serverstats.deleteConfirmBtn'))
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`counter-delete:cancel:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel(t(lang, 'wolf.cmd.serverstats.deleteCancelBtn'))
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] }).catch(logger.error);

    } catch (error) {
        logger.error("Error in handleDelete:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.deleteErrorFetch'))]
        }).catch(logger.error);
    }
}

export async function performDeletionByCounterId(client, guild, counterId, lang = 'es') {
    try {
        const counters = await getServerCounters(client, guild.id);

        const counter = counters.find(c => c.id === counterId);
        if (!counter) {
            return {
                success: false,
                message: t(lang, 'wolf.cmd.serverstats.performNotFound', { id: counterId })
            };
        }

        const updatedCounters = counters.filter(c => c.id !== counter.id);

        const saved = await saveServerCounters(client, guild.id, updatedCounters);
        if (!saved) {
            return {
                success: false,
                message: t(lang, 'wolf.cmd.serverstats.performSaveFailed')
            };
        }

        const channel = guild.channels.cache.get(counter.channelId);
        let channelDeleted = false;

        if (channel) {
            try {
                await channel.delete(`Counter deleted - removing channel: ${counter.id}`);
                channelDeleted = true;
            } catch (error) {
                logger.error("Error deleting channel:", error);
            }
        }

        const typeDisplay = `${getCounterEmoji(counter.type)} ${getCounterTypeLabel(counter.type)}`;
        let message = t(lang, 'wolf.cmd.serverstats.performSuccess', { id: counter.id, typeDisplay });

        if (channelDeleted) {
            message += t(lang, 'wolf.cmd.serverstats.performChannelDeleted', { name: channel.name });
        } else if (channel) {
            message += t(lang, 'wolf.cmd.serverstats.performChannelFailed', { name: channel.name });
        } else {
            message += t(lang, 'wolf.cmd.serverstats.performChannelAlreadyDeleted');
        }

        return { success: true, message };

    } catch (error) {
        logger.error("Error deleting counter:", error);
        return {
            success: false,
            message: t(lang, 'wolf.cmd.serverstats.performError')
        };
    }
}
