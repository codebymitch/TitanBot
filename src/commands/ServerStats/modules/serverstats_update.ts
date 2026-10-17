import { PermissionFlagsBits } from 'discord.js';
import { createEmbed, successEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, updateCounter, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import type { NexoClient } from '../../../types/index.js';
export async function handleUpdate(interaction: ChatInputCommandInteraction, client: NexoClient) {
    const guild = interaction.guild!;
    const counterId = interaction.options.getString("counter-id");
    const newType = interaction.options.getString("type");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Kanäle verwalten**, um Zähler zu aktualisieren.' }).catch(logger.error);
        return;
    }

    if (!newType) {
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du musst einen neuen Zählertyp angeben.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        const counterIndex = counters.findIndex(c => c.id === counterId);
        if (counterIndex === -1) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Zähler mit der ID \`${counterId}\` nicht gefunden. Nutze \`/serverstats list\`, um alle Zähler anzusehen.` }).catch(logger.error);
            return;
        }

        const counter = counters[counterIndex];
        const oldChannel = guild.channels.cache.get(counter.channelId);

        if (!oldChannel) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Der Kanal dieses Zählers existiert nicht mehr. Zähler gelöschter Kanäle können nicht aktualisiert werden.' }).catch(logger.error);
            return;
        }

        if (newType !== counter.type) {
            const existingTypeCounter = counters.find(c => c.type === newType && c.id !== counter.id);
            if (existingTypeCounter) {
                const existingChannel = guild.channels.cache.get(existingTypeCounter.channelId);
                await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Auf diesem Server gibt es bereits einen **${getCounterTypeLabel(newType)}**-Zähler${existingChannel ? ` in ${existingChannel}` : ''}. Lösche ihn zuerst, bevor du diesen Typ erneut verwendest.` }).catch(logger.error);
                return;
            }
        }

        const oldType = counter.type;

        counter.type = newType;
        counter.updatedAt = new Date().toISOString();

        const saved = await saveServerCounters(client, guild.id, counters);
        if (!saved) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die aktualisierten Zählerdaten konnten nicht gespeichert werden. Bitte versuche es erneut.' }).catch(logger.error);
            return;
        }

        const updatedCounter = counters[counterIndex];
        const updated = await updateCounter(client, guild, updatedCounter);
        if (!updated) {
            await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Zähler aktualisiert, aber der Kanalname konnte nicht aktualisiert werden. Er wird beim nächsten geplanten Durchlauf aktualisiert.' }).catch(logger.error);
            return;
        }

        const finalChannel = guild.channels.cache.get(updatedCounter.channelId);

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [successEmbed(`**Zähler erfolgreich aktualisiert!**\n\n**Zähler-ID:** \`${counterId}\`\n**Typ geändert:** ${getCounterEmoji(oldType)} ${getCounterTypeLabel(oldType)} → ${getCounterEmoji(newType)} ${getCounterTypeLabel(newType)}\n\n**Aktuelle Einstellungen:**\n**Typ:** ${getCounterEmoji(updatedCounter.type)} ${getCounterTypeLabel(updatedCounter.type)}\n**Kanal:** ${finalChannel}\n**Kanalname:** ${finalChannel!.name}\n\nDer Zähler wird automatisch alle 15 Minuten aktualisiert.`)]
        }).catch(logger.error);

    } catch (error) {
        logger.error("Error updating counter:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Aktualisieren des Zählers ist ein Fehler aufgetreten. Bitte versuche es erneut.' }).catch(logger.error);
    }
}