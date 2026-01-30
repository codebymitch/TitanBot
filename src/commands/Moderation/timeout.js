import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';


// Duration choices for Discord's UI
const durationChoices = [
    { name: "5 minutes", value: 5 },
    { name: "10 minutes", value: 10 },
    { name: "30 minutes", value: 30 },
    { name: "1 hour", value: 60 },
    { name: "6 hours", value: 360 },
    { name: "1 day", value: 1440 },
    { name: "1 week", value: 10080 },
];
// Migrated from: commands/Moderation/timeout.js
export default {
    data: new SlashCommandBuilder()
        .setName("timeout")
        .setDescription("Timeout a user for a specific duration.")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("User to timeout")
                .setRequired(true),
        )
        .addIntegerOption(
            (option) =>
                option
                    .setName("duration")
                    .setDescription("Duration of the timeout")
                    .setRequired(true)
                    .addChoices(...durationChoices), // Use predefined choices
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the timeout"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers), // Requires Moderate Members permission
    category: "moderation",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        // Permission Check
        if (
            !interaction.member.permissions.has(
                PermissionFlagsBits.ModerateMembers,
            )
        )
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Permission Denied",
                        "You need the `Moderate Members` permission to set a timeout.",
                    ),
                ],
            });

        const targetUser = interaction.options.getUser("target");
        const member = interaction.options.getMember("target");
        const durationMinutes = interaction.options.getInteger("duration");
        const reason =
            interaction.options.getString("reason") || "No reason provided";

        // Prevent self/bot moderation
        if (targetUser.id === interaction.user.id) {
            return interaction.editReply({
                embeds: [errorEmbed("You cannot timeout yourself.")],
            });
        }
        if (targetUser.id === client.user.id) {
            return interaction.editReply({
                embeds: [errorEmbed("You cannot timeout the bot.")],
            });
        }
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

        // Hierarchy Check (If the target is higher than the moderator or the bot)
        if (!member.moderatable)
            return interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Cannot Timeout",
                        "I cannot timeout this user. They might have a higher role than me or you.",
                    ),
                ],
            });

        try {
            // Convert duration from minutes to milliseconds
            const durationMs = durationMinutes * 60 * 1000;

            // Timeout the member
            await member.timeout(durationMs, reason);

            const durationDisplay =
                durationChoices.find((c) => c.value === durationMinutes)
                    ?.name || `${durationMinutes} minutes`;

            // Log the moderation action with enhanced system
            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Timed Out",
                    target: `${targetUser.tag} (${targetUser.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason: `${reason}\nDuration: ${durationDisplay}`,
                    duration: durationDisplay,
                    metadata: {
                        userId: targetUser.id,
                        moderatorId: interaction.user.id,
                        durationMinutes,
                        timeoutEnds: new Date(Date.now() + durationMs).toISOString()
                    }
                }
            });

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `⏳ **Timed out** ${targetUser.tag} for ${durationDisplay}.`,
                        `**Reason:** ${reason}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error("Timeout Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "An unexpected error occurred during the timeout action. Please check my role permissions.",
                    ),
                ],
            });
        }
    },
};
