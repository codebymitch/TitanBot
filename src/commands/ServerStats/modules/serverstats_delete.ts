import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji, getCounterTypeLabel } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes, createError, wrapServiceBoundary } from '../../../utils/errorHandler.js';
import type { ChatInputCommandInteraction, Guild, GuildMember } from 'discord.js';
import type { NexoClient } from '../../../types/index.js';
export async function handleDelete(interaction: ChatInputCommandInteraction, client: NexoClient) {
    const guild = interaction.guild!;
    const counterId = interaction.options.getString("counter-id");

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Kanäle verwalten**, um Zähler zu löschen.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: 'Keine Zähler zum Löschen gefunden.' }).catch(logger.error);
            return;
        }

        const counterToDelete = counters.find(c => c.id === counterId);
        if (!counterToDelete) {
            await replyUserError(interaction, { type: ErrorTypes.USER_INPUT, message: `Zähler mit der ID \`${counterId}\` nicht gefunden. Nutze \`/serverstats list\`, um alle Zähler anzusehen.` }).catch(logger.error);
            return;
        }

        const channel = guild.channels.cache.get(counterToDelete.channelId);

        const embed = createEmbed({
            title: "Zähler & Kanal löschen",
            description: `Willst du diesen Zähler und seinen Kanal wirklich löschen?\n\n**ID:** \`${counterToDelete.id}\`\n**Typ:** ${getCounterTypeDisplay(counterToDelete.type)}\n**Kanal:** ${channel || 'Gelöschter Kanal'}\n\n **Der Kanal wird dauerhaft gelöscht!**`,
            color: getColor('error')
        });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`counter-delete:confirm:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Löschen bestätigen")
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`counter-delete:cancel:${counterToDelete.id}:${interaction.user.id}`)
                .setLabel("Abbrechen")
                .setStyle(ButtonStyle.Secondary)
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed], components: [row] }).catch(logger.error);

    } catch (error) {
        logger.error("Error in handleDelete:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Abrufen der Zähler ist ein Fehler aufgetreten. Bitte versuche es erneut.' }).catch(logger.error);
    }
}

export const performDeletionByCounterId = wrapServiceBoundary(async function performDeletionByCounterId(client: NexoClient, guild: Guild, counterId: string) {
    const counters = await getServerCounters(client, guild.id);

    const counter = counters.find(c => c.id === counterId);
    if (!counter) {
        throw createError(
            'Counter not found',
            ErrorTypes.USER_INPUT,
            `Zähler mit der ID \`${counterId}\` wurde nicht gefunden.`,
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const updatedCounters = counters.filter(c => c.id !== counter.id);

    const saved = await saveServerCounters(client, guild.id, updatedCounters);
    if (!saved) {
        throw createError(
            'Counter delete failed',
            ErrorTypes.DATABASE,
            'Zähler konnte nicht gelöscht werden. Bitte versuche es erneut.',
            { guildId: guild.id, counterId, operation: 'performDeletionByCounterId' }
        );
    }

    const channel = guild.channels.cache.get(counter.channelId);
    let channelDeleted = false;

    if (channel) {
        try {
            await channel.delete(`Zähler gelöscht – Kanal wird entfernt: ${counter.id}`);
            channelDeleted = true;
        } catch (error) {
            logger.error("Error deleting channel:", error);
        }
    }

    let message = `✅ **Zähler erfolgreich gelöscht!**\n\n**ID:** \`${counter.id}\`\n**Typ:** ${getCounterTypeDisplay(counter.type)}`;

    if (channelDeleted) {
        message += `\n**Kanal:** ${channel!.name} (gelöscht)`;
    } else if (channel) {
        message += `\n**Kanal:** ${channel.name} (Löschen fehlgeschlagen)`;
    } else {
        message += `\n**Kanal:** Bereits gelöscht`;
    }

    return { message };
}, {
    service: 'serverstats',
    operation: 'performDeletionByCounterId',
    userMessage: 'Beim Löschen des Zählers ist ein Fehler aufgetreten. Bitte versuche es erneut.',
});

function getCounterTypeDisplay(type: string) {
    return `${getCounterEmoji(type)} ${getCounterTypeLabel(type)}`;
}