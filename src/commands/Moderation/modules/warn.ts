import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, MessageFlags, type GuildMember } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { logModerationAction } from '../../../utils/moderation.js';
import { logger } from '../../../utils/logger.js';
import { WarningService } from '../../../services/moderation/warningService.js';
import { ModerationService } from '../../../services/moderation/moderationService.js';
import { NexoBotError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Einen Nutzer verwarnen")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("Nutzer, der verwarnt werden soll"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Grund für die Verwarnung"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Warn interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'warn'
            });
            return;
        }

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const guildId = interaction.guildId!;

        if (!target) {
            throw new NexoBotError(
                'Missing target user',
                ErrorTypes.USER_INPUT,
                'Du musst einen Nutzer zum Verwarnen angeben.',
                { subtype: 'invalid_user' },
            );
        }

        if (!reason) {
            throw new NexoBotError(
                'Missing warning reason',
                ErrorTypes.VALIDATION,
                'Du musst einen Grund für die Verwarnung angeben.',
                { subtype: 'missing_required' },
            );
        }

        if (!member) {
            throw new NexoBotError(
                "Target not found",
                ErrorTypes.USER_INPUT,
                "Der Nutzer ist gerade nicht auf diesem Server."
            );
        }

        ModerationService.assertModerationHierarchy(interaction.member as GuildMember, member as GuildMember, 'warn');

        const { id, totalCount } = await WarningService.addWarning({
            guildId,
            userId: target.id,
            moderatorId: moderator.id,
            reason,
            timestamp: Date.now()
        });

        await logModerationAction({
            client,
            guild: interaction.guild!,
            event: {
                action: "User Warned",
                target: `${target.tag} (${target.id})`,
                executor: `${moderator.tag} (${moderator.id})`,
                reason,
                metadata: {
                    userId: target.id,
                    moderatorId: moderator.id,
                    totalWarns: totalCount,
                    warningNumber: totalCount,
                    warningId: id
                }
            }
        });

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                successEmbed(
                    `⚠️ **Verwarnt:** ${target.tag}`,
                    `**Grund:** ${reason}\n**Verwarnungen gesamt:** ${totalCount}`,
                ),
            ],
        });
    }
} satisfies Command;