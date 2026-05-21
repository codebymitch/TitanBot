import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { t } from '../../../services/i18n.js';

export async function handleCreate(interaction, client, lang) {
    const guild = interaction.guild;
    const type = interaction.options.getString("type");
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.noPermsCreate'))]
        }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.invalidCategory'))]
            }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            const where = duplicateChannel
                ? t(lang, 'wolf.cmd.serverstats.duplicateTypeIn', { channel: duplicateChannel })
                : '';
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.duplicateType', { label: getCounterTypeLabel(type), where }))]
            }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Counter channel created by ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.duplicateChannel', { channel: targetChannel.name }))]
            }).catch(logger.error);
            return;
        }

        const newCounter = {
            id: Date.now().toString(),
            type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Counter creation failed during save').catch(() => null);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.saveFailed'))]
            }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.updateChannelFailed'))]
            }).catch(logger.error);
            return;
        }

        const channelTypeLabel = targetChannel.type === ChannelType.GuildVoice
            ? t(lang, 'wolf.cmd.serverstats.channelTypeVoice')
            : t(lang, 'wolf.cmd.serverstats.channelTypeText');

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(t(lang, 'wolf.cmd.serverstats.createSuccess', {
                label: getCounterTypeLabel(type),
                channelType: channelTypeLabel,
                category,
                channel: targetChannel,
                channelName: targetChannel.name,
                id: newCounter.id,
            }))]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [errorEmbed(t(lang, 'wolf.cmd.serverstats.createError'))]
        }).catch(logger.error);
    }
}
