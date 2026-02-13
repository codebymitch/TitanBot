import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
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
.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    category: "moderation",

    async execute(interaction, config, client) {
        try {
            if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                throw new Error("You do not have permission to ban members.");
            }

            const user = interaction.options.getUser("target");
            const reason = interaction.options.getString("reason") || "No reason provided";

            if (user.id === interaction.user.id) {
                throw new Error("You cannot ban yourself.");
            }
            if (user.id === client.user.id) {
                throw new Error("You cannot ban the bot.");
            }

            const targetMember = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            if (targetMember && interaction.member.roles.highest.position <= targetMember.roles.highest.position) {
                throw new Error("You cannot ban a user with an equal or higher role than you.");
            }
            if (targetMember && interaction.guild.members.me.roles.highest.position <= targetMember.roles.highest.position) {
                throw new Error("I cannot ban a user with an equal or higher role than me.");
            }

            await interaction.guild.members.ban(user, { reason });

            await logModerationAction({
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

            await InteractionHelper.universalReply(interaction, {
                embeds: [
                    successEmbed(
                        `🚫 **Banned** ${user.tag}`,
                        `**Reason:** ${reason}`,
                    ),
                ],
            });
        } catch (error) {
            logger.error('Ban command error:', error);
            const errorMessage = {
                embeds: [errorEmbed("Ban Failed", error.message || "Could not ban that user. They might have a higher role or insufficient permissions.")]
            };
            
            await InteractionHelper.universalReply(interaction, errorMessage);
        }
    },
};



