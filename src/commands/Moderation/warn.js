import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

// Migrated from: commands/Moderation/warn.js
export default {
    data: new SlashCommandBuilder()
        .setName("warn")
        .setDescription("Warn a user")
        .addUserOption((o) =>
            o
                .setName("target")
                .setRequired(true)
                .setDescription("User to warn"),
        )
        .addStringOption((o) =>
            o
                .setName("reason")
                .setRequired(true)
                .setDescription("Reason for the warning"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ModerateMembers,
            )
        )
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Moderate Members` permission to issue warnings.",
                    ),
                ],
            });

        const target = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const reason = interaction.options.getString("reason");
        const moderator = interaction.user;
        const guildId = interaction.guildId;

        if (!member) {
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Target Not Found",
                        "The target user is not currently in this server.",
                    ),
                ],
            });
        }

        try {
            const warningsKey = `warnings-${guildId}-${target.id}`;
            const userWarns = await client.db.get(warningsKey);
            
            // Ensure userWarns is an array, handle corrupted or invalid data
            const warningsArray = Array.isArray(userWarns) ? userWarns : [];

            const newWarning = {
                reason: reason,
                moderatorId: moderator.id,
                date: Date.now(),
            };
            warningsArray.push(newWarning);

            await client.db.set(warningsKey, warningsArray);

            const totalWarns = warningsArray.length;

            // Log the moderation action with enhanced system
            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "User Warned",
                    target: `${target.tag} (${target.id})`,
                    executor: `${moderator.tag} (${moderator.id})`,
                    reason,
                    metadata: {
                        userId: target.id,
                        moderatorId: moderator.id,
                        totalWarns,
                        warningNumber: totalWarns
                    }
                }
            });

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `⚠️ **Warned** ${target.tag}`,
                        `**Reason:** ${reason}\n**Total Warns:** ${totalWarns}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error("Warn Command Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Database Error",
                        "An error occurred while trying to save the warning to the database.",
                    ),
                ],
            });
        }
    },
};
