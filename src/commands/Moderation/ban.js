import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

// Migrated from: commands/Moderation/ban.js
export default {
    data: new SlashCommandBuilder()
        .setName("ban")
        .setDescription("Ban a user from the server")
        .addUserOption((option) =>
            option
                .setName("target")
                .setDescription("The user to ban")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the ban"),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers), // Added default permission requirement
    category: "moderation",

    // Added client argument for logEvent
    async execute(interaction, config, client) {
        // Defer reply for the ban action
        await interaction.deferReply({ flags: ["Ephemeral"] });

        // Permission check is slightly redundant due to setDefaultMemberPermissions, but good practice
        if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers))
            return interaction.editReply({
                embeds: [
                    errorEmbed("You do not have permission to ban members."),
                ],
            });

        const user = interaction.options.getUser("target");
        const reason =
            interaction.options.getString("reason") || "No reason provided";

        // Prevent banning the bot or the interaction user if they are the target
        if (user.id === interaction.user.id) {
            return interaction.editReply({
                embeds: [errorEmbed("You cannot ban yourself.")],
            });
        }
        if (user.id === client.user.id) {
            return interaction.editReply({
                embeds: [errorEmbed("You cannot ban the bot.")],
            });
        }

        try {
            // Attempt to fetch the target member to check hierarchy
            const targetMember = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            // Hierarchy check
            if (
                targetMember &&
                interaction.member.roles.highest.position <=
                    targetMember.roles.highest.position
            ) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Cannot Ban",
                            "You cannot ban a user with an equal or higher role than you.",
                        ),
                    ],
                });
            }
            if (
                targetMember &&
                interaction.guild.members.me.roles.highest.position <=
                    targetMember.roles.highest.position
            ) {
                return interaction.editReply({
                    embeds: [
                        errorEmbed(
                            "Bot Hierarchy Error",
                            "I cannot ban a user with an equal or higher role than me.",
                        ),
                    ],
                });
            }

            await interaction.guild.members.ban(user, { reason });

            // Log the moderation action with enhanced system
            const caseId = await logModerationAction({
                client,
                guild: interaction.guild,
                event: {
                    action: "Member Banned",
                    target: `${user.tag} (${user.id})`,
                    executor: `${interaction.user.tag} (${interaction.user.id})`,
                    reason,
                    metadata: {
                        userId: user.id,
                        moderatorId: interaction.user.id,
                        permanent: true
                    }
                }
            });

            await interaction.editReply({
                embeds: [
                    successEmbed(
                        `🚫 **Banned** ${user.tag}\n**Reason:** ${reason}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error("Ban Error:", error);
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "I could not ban that user. They might be an admin or have a higher role than me.",
                    ),
                ],
            });
        }
    },
};
