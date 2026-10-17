import { getColor } from '../../../config/bot.js';
import { PermissionFlagsBits } from 'discord.js';
import type { ServerCounter } from '../../../services/serverstatsService.js';
import { createEmbed } from '../../../utils/embeds.js';
import { getServerCounters, saveServerCounters, getCounterEmoji as getCounterTypeEmoji, getCounterTypeLabel, getGuildCounterStats } from '../../../services/serverstatsService.js';
import { logger } from '../../../utils/logger.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import type { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import type { NexoClient } from '../../../types/index.js';
export async function handleList(interaction: ChatInputCommandInteraction, client: NexoClient) {
    const guild = interaction.guild!;

    try {
        await InteractionHelper.safeDefer(interaction);
    } catch (error) {
        logger.error("Failed to defer reply:", error);
        return;
    }

    if (!(interaction.member as GuildMember).permissions.has(PermissionFlagsBits.ManageChannels)) {
        await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Kanäle verwalten**, um Zähler anzusehen.' }).catch(logger.error);
        return;
    }

    try {
        const counters = await getServerCounters(client, guild.id);
        const stats = await getGuildCounterStats(guild);

        const validCounters: ServerCounter[] = [];
        const orphanedCounters: ServerCounter[] = [];
        
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
                title: "Server-Zähler",
                description: "Für diesen Server wurden noch keine Zähler eingerichtet.\n\nNutze `/serverstats create`, um deinen ersten Zähler einzurichten!",
                color: getColor('warning')
            });

            embed.addFields({
                name: "**Verfügbare Zählertypen**",
                value: "**Mitglieder + Bots** - Alle Servermitglieder\n **Nur Mitglieder** - Nur menschliche Mitglieder\n **Nur Bots** - Nur Bot-Mitglieder",
                inline: false
            });

            embed.addFields({
                name: "**Beispiele**",
                value: "`/serverstats create type:members channel_type:voice category:Stats`\n`/serverstats create type:bots channel_type:text category:Server Info`\n`/serverstats list`",
                inline: false
            });

            embed.setFooter({ 
                text: "Zählersystem • Automatische Aktualisierung alle 15 Minuten" 
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);
            return;
        }

        const embed = createEmbed({
            title: `Server-Zähler (${validCounters.length})`,
            description: "Hier sind alle aktiven Zähler dieses Servers.\n\nZähler werden automatisch alle 15 Minuten aktualisiert.",
            color: getColor('info')
        });

        for (let i = 0; i < validCounters.length; i++) {
            const counter = validCounters[i];
            const channel = guild.channels.cache.get(counter.channelId);
            
            if (!channel) {
                
                logger.warn(`Counter ${counter.id} still has missing channel after cleanup`);
                continue;
            }

            const currentCount = getCurrentCount(stats, counter.type);
            const status = channel.name.includes(':') ? '✅ Aktiv' : '⚠️ Nicht aktualisiert';
            
            embed.addFields({
                name: `${getCounterTypeEmoji(counter.type)} Zähler #${i + 1} - ${channel.name}`,
                value: `**ID:** \`${counter.id}\`\n**Typ:** ${getCounterTypeDisplay(counter.type)}\n**Kanal:** ${channel}\n**Aktueller Stand:** ${currentCount}\n**Status:** ${status}\n**Erstellt:** ${new Date(counter.createdAt).toLocaleDateString()}`,
                inline: false
            });
        }

        embed.addFields({
            name: "**Statistiken**",
            value: `**Zähler gesamt:** ${validCounters.length}\n**Aktive Zähler:** ${validCounters.filter(c => {
                const channel = guild.channels.cache.get(c.channelId);
                return channel && channel.name.includes(':');
            }).length}\n**Nächste Aktualisierung:** <t:${Math.floor(Date.now() / 1000) + 900}:R>`,
            inline: false
        });

        embed.addFields({
            name: "**Verwaltungs-Commands**",
            value: "`/serverstats create` - Neuen Zähler erstellen\n`/serverstats update` - Bestehenden Zähler aktualisieren\n`/serverstats delete` - Zähler löschen",
            inline: false
        });

        embed.setFooter({ 
            text: "Zählersystem • Automatische Aktualisierung alle 15 Minuten" 
        });
        embed.setTimestamp();

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] }).catch(logger.error);

    } catch (error) {
        logger.error("Error displaying counters:", error);
        await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Abrufen der Zähler ist ein Fehler aufgetreten. Bitte versuche es erneut.' }).catch(logger.error);
    }
}

function getCounterTypeDisplay(type: string) {
    return `${getCounterTypeEmoji(type)} ${getCounterTypeLabel(type)}`;
}

function getCounterEmoji(type: string) {
    return getCounterTypeEmoji(type);
}

function getCurrentCount(stats: Awaited<ReturnType<typeof getGuildCounterStats>>, type: string) {
    switch (type) {
        case "members":
            return stats.totalCount;
        case "bots":
            return stats.botCount;
        case "members_only":
            return stats.humanCount;
        default:
            return 0;
    }
}