import { PermissionFlagsBits } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { t } from '../../../services/i18n.js';

export async function handleUpdate(interaction, client, lang) {
    const guild = interaction.guild;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.noPermsUpdate'))]
        }).catch(logger.error);
        return;
    }

    if (!newType) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateNoType'))]
        }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateNotFound', { id: counterId }))]
            }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateChannelDeleted'))]
            }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                const where = existingChannel
                    ? t(lang, 'wolf.cmd.serverstats.duplicateTypeIn', { channel: existingChannel })
                    : '';
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateDuplicateOther', { label: getCounterTypeLabel(newType), where }))]
                }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateSaveFailed'))]
            }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateChannelNameFailed'))]
            }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(t(lang, 'wolf.cmd.serverstats.updateSuccess', {
                id: counterId,
                oldEmoji: getCounterEmoji(oldType),
                oldLabel: getCounterTypeLabel(oldType),
                newEmoji: getCounterEmoji(newType),
                newLabel: getCounterTypeLabel(newType),
                emoji: getCounterEmoji(updatedCounter.type),
                label: getCounterTypeLabel(updatedCounter.type),
                channel: finalChannel,
                channelName: finalChannel.name,
            }))]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error updating counter:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateError'))]
        }).catch(logger.error);
    }
}
