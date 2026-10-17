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
        .setName("masskick")
        .setDescription("Mehrere Nutzer auf einmal vom Server kicken")
        .addStringOption(option =>
            option
                .setName("users")
                .setDescription("Nutzer-IDs oder Erwähnungen zum Kicken (durch Leerzeichen oder Kommas getrennt)")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("reason")
                .setDescription("Grund für den Massenkick")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
    category: "moderation",
    abuseProtection: { maxAttempts: 3, windowMs: 60_000 },

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Masskick interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'masskick'
            });
            return;
        }

        const usersInput = interaction.options.getString("users")!;
        const reason = interaction.options.getString("reason") || "Massenkick – kein Grund angegeben";

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
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst dich nicht selbst in einen Massenkick aufnehmen.' });
            }

            if (userIds.includes(client.user.id)) {
                return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du kannst den Bot nicht in einen Massenkick aufnehmen.' });
            }

            const results: MassActionResults = {
                successful: [],
                failed: [],
                skipped: []
            };

            for (const userId of userIds) {
                try {
                    const member = await interaction.guild!.members.fetch(userId).catch(() => null);
                    
                    if (!member) {
                        results.failed.push({ userId, reason: "Nutzer ist nicht auf dem Server" });
                        continue;
                    }

                    const modCheck = ModerationService.validateHierarchy(interaction.member as GuildMember, member, 'kick');
                    if (!modCheck.valid) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.member as GuildMember, member, 'kick'),
                        });
                        continue;
                    }

                    const botCheck = ModerationService.validateBotHierarchy(member, 'kick');
                    if (!botCheck.valid) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: ModerationService.buildHierarchySkipReason(interaction.member as GuildMember, member, 'kick', 'bot'),
                        });
                        continue;
                    }

                    if (!member.kickable) {
                        results.skipped.push({
                            user: member.user.tag,
                            userId,
                            reason: 'Ziel hat Admin oder eine verwaltete Rolle, oder dem Bot fehlt „Mitglieder kicken“',
                        });
                        continue;
                    }

                    await member.kick(reason);

                    results.successful.push({
                        user: member.user.tag,
                        userId
                    });

                    await logModerationAction({
                        client,
                        guild: interaction.guild!,
                        event: {
                            action: "Member Kicked",
                            target: `${member.user.tag} (${member.user.id})`,
                            executor: `${interaction.user.tag} (${interaction.user.id})`,
                            reason: `${reason} (Massenkick)`,
                            metadata: {
                                userId: member.user.id,
                                moderatorId: interaction.user.id,
                                massKick: true
                            }
                        }
                    });

                } catch (error) {
                    logger.error(`Failed to kick user ${userId}:`, error);
                    const reason = error instanceof NexoBotError
                        ? (error.userMessage || error.message)
                        : ((error as ErrorLike).message || "Unbekannter Fehler");
                    results.failed.push({ 
                        userId, 
                        reason,
                    });
                }
            }

            let description = `**Ergebnisse des Massenkicks:**\n\n`;
            
            if (results.successful.length > 0) {
                description += `✅ **Erfolgreich gekickt (${results.successful.length}):**\n`;
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
                        `👢 Massenkick abgeschlossen`,
                        description
                    )
                ]
            });

        } catch (error) {
            logger.error("Error in masskick command:", error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Massenkick ist ein Fehler aufgetreten. Bitte versuch es später noch einmal.' });
        }
    }
} satisfies Command;