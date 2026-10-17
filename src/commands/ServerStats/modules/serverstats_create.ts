import { PermissionFlagsBits, ChannelType } from 'discord.js';
import type { ServerCounter } from '../../../services/serverstatsService.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterBaseName, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import type { NexoClient } from '../../../types/index.js';
export async function handleCreate(interaction: ChatInputCommandInteraction, client: NexoClient) {
    const guild = interaction.guild!;
    const type = interaction.options.getString("type")!;
    const channelType = interaction.options.getString("channel_type");
    const category = interaction.options.getChannel("category");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Kanäle verwalten**, um Zähler zu erstellen.' }).catch(logger.error);
        return;
    }

    try {
        if (!category || category.type !== ChannelType.GuildCategory) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Bitte wähle eine gültige Kategorie für den Zählerkanal.' }).catch(logger.error);
            return;
        }

        const targetChannelType = channelType === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
        const baseChannelName = getCounterBaseName(type);

        const counters = await getServerCounters(client, guild.id);

        const duplicateType = counters.find(counter => counter.type === type);

        if (duplicateType) {
            const duplicateChannel = guild.channels.cache.get(duplicateType.channelId);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Auf diesem Server gibt es bereits einen **${getCounterTypeLabel(type)}**-Zähler${duplicateChannel ? ` in ${duplicateChannel}` : ''}. Lösche ihn zuerst, bevor du einen neuen erstellst.` }).catch(logger.error);
            return;
        }

        const targetChannel = await guild.channels.create({
            name: baseChannelName,
            type: targetChannelType,
            parent: category.id,
            reason: `Zählerkanal erstellt von ${interaction.user.tag}`
        });

        const existingCounter = counters.find(c => c.channelId === targetChannel.id);
        if (existingCounter) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Für den Kanal **${targetChannel.name}** gibt es bereits einen Zähler. Lösche ihn zuerst oder wähle einen anderen Typ.` }).catch(logger.error);
            return;
        }

        const newCounter: ServerCounter = {
            id: Date.now().toString(),
            type: type,
            channelId: targetChannel.id,
            guildId: guild.id,
            createdAt: new Date().toISOString(),
            enabled: true
        };

        counters.push(newCounter);

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await targetChannel.delete('Zählererstellung beim Speichern fehlgeschlagen').catch(() => null);
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Zählerdaten konnten nicht gespeichert werden. Bitte versuche es erneut.' }).catch(logger.error);
            return;
        }

        const updated = await updateCounter(client, guild, newCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Zähler erstellt, aber der Kanalname konnte nicht aktualisiert werden. Er wird beim nächsten geplanten Durchlauf aktualisiert.' }).catch(logger.error);
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`**Zähler erfolgreich erstellt!**\n\n**Typ:** ${getCounterTypeLabel(type)}\n**Kanaltyp:** ${targetChannel.type === ChannelType.GuildVoice ? 'Sprachkanal' : 'Textkanal'}\n**Kategorie:** ${category}\n**Kanal:** ${targetChannel}\n**Kanalname:** ${targetChannel.name}\n**Zähler-ID:** \`${newCounter.id}\`\n\nDer Zähler wird automatisch alle 15 Minuten aktualisiert.\n\nNutze \`/serverstats list\`, um alle Zähler anzusehen.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error creating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Erstellen des Zählers ist ein Fehler aufgetreten. Bitte versuche es erneut.' }).catch(logger.error);
    }
}