import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type GuildMember } from 'discord.js';
import { createEmbed, successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logModerationAction } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';
import { NexoBotError, replyUserError, ErrorTypes, type ErrorLike } from '../../../utils/errorHandler.js';

import { InteractionHelper } from '../../../utils/interactionHelper.js';
interface MassActionResults {
    successful: { user: string; userId: string }[];
    failed: { userId: string; reason: string }[];
    skipped: { user: string; userId: string; reason: string }[];
}

export default {
    data: new SlashCommandBuilder()
        .setName("massban")
        .setDescription("Mehrere Nutzer auf einmal vom Server bannen")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("Nutzer-IDs oder Erwähnungen zum Bannen (durch Leerzeichen oder Kommas getrennt)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Grund für den Massenbann")
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName("delete_days")
                .setDescription("Wie viele Tage an Nachrichten gelöscht werden sollen (0-7)")
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Massban interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'massban'
            });
            return;
        }

        const usersInput = interaction.options.getString("users")!;
        const reason = interaction.options.getString("reason") || "Massenbann – kein Grund angegeben";
        const deleteDays = interaction.options.getInteger("delete_days") || 0;

        try {
            const userIds = usersInput
.replace(/<@!?(\d+)>/g, '$1')
.split(/[\s,]+/)
.filter(id => id && /^\d+$/.test(id))
.slice(0, 20);

            if (userIds.length === 0) {
                return await replyUserError(interaction, { type: ErrorTypes.VALIDATION, message: 'Bitte gib gültige Nutzer-IDs oder Erwähnungen an. Maximal 20 Nutzer auf einmal.' });
            }

            if (userIds.includes(interaction.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst dich nicht selbst in einen Massenbann aufnehmen.' });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst den Bot nicht in einen Massenbann aufnehmen.' });
            }

            const results: MassActionResults = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const user = await client.users.fetch(userId).catch(() => null);
                    
                    if (!user) {
                        results.failed.push({ userId, reason: "Nutzer nicht gefunden" });
                        continue;
                    }

                    const member = await interaction.guild!.members.fetch(userId).catch(() => null);
                    
                    if (member) {
                        const modCheck = ModerationService.validateHierarchy(interaction.member as GuildMember, member, 'ban');
                        if (!modCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.member as GuildMember, member, 'ban'),
                            });
                            continue;
                        }

                        const botCheck = ModerationService.validateBotHierarchy(member, 'ban');
                        if (!botCheck.valid) {
                            results.skipped.push({
                                user: user.tag,
                                userId,
                                reason: ModerationService.buildHierarchySkipReason(interaction.member as GuildMember, member, 'ban', 'bot'),
                            });
                            continue;
                        }
                    }

                    await interaction.guild!.members.ban(userId, {
                        reason: reason,
                        deleteMessageSeconds: deleteDays * 24 * 60 * 60
                    });

                    results.successful.push({
                        user: user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild!,
                        event: {
                            action: "Member Banned",
                            target: `${user.tag} (${user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Massenbann)`,
                            metadata: {
                                userId: user.id,
                                moderatorId: interaction.user.id,
                                massBan: true,
                                permanent: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to ban user ${userId}:`, error);
                    const reason = error instanceof NexoBotError
                        ? (error.userMessage || error.message)
                        : ((error as ErrorLike).message || "Unbekannter Fehler");
                    results.failed.push({ 
                        userId, 
                        reason,
                    });
                }
            }

            let description = `**Ergebnisse des Massenbanns:**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **Erfolgreich gebannt (${results.successful.length}):**\n`;
                results.successful.forEach(result => {
                    description += `• ${result.user} (${result.userId})\n`;
                });
                description += '\n';
            }

            if (results.skipped.length > 0) {
                description += `⚠️ **Übersprungen (${results.skipped.length}):**\n`;
                results.skipped.forEach(result => {
                    description += `• ${result.user} - ${result.reason}\n`;
                });
                description += '\n';
            }

            if (results.failed.length > 0) {
                description += `❌ **Fehlgeschlagen (${results.failed.length}):**\n`;
                results.failed.forEach(result => {
                    description += `• ${result.userId} - ${result.reason}\n`;
                });
            }

            const embed = results.successful.length > 0 ? successEmbed : warningEmbed;
            
            return await InteractionHelper.safeEditReply(interaction, {
                embeds: [
                    embed(
                        `🔨 Massenbann abgeschlossen`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in massban command:", error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Massenbann ist ein Fehler aufgetreten. Bitte versuch es später noch einmal.' });
        }
    }
} satisfies Command;