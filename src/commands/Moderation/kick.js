import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logModerationAction } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from the server")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription("The user to kick")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("reason").setDescription("Reason for the kick"),
    )
.setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  category: "moderation",

  async execute(interaction, config, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
      return await interaction.editReply({
        embeds: [
          errorEmbed(
            "Permission Denied",
            "You do not have permission to kick members.",
          ),
        ],
      });

    const targetUser = interaction.options.getUser("target");
    const member = interaction.options.getMember("target");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    if (targetUser.id === interaction.user.id) {
      return await interaction.editReply({
        embeds: [errorEmbed("You cannot kick yourself.")],
      });
    }
    if (targetUser.id === client.user.id) {
      return await interaction.editReply({
        embeds: [errorEmbed("You cannot kick the bot.")],
      });
    }

    if (!member) {
      return await interaction.editReply({
        embeds: [
          errorEmbed(
            "Target Not Found",
            "The target user is not currently in this server, and therefore cannot be kicked.",
          ),
        ],
      });
    }

    try {
        if (
        interaction.member.roles.highest.position <=
        member.roles.highest.position
      ) {
        return await interaction.editReply({
          embeds: [
            errorEmbed(
              "Cannot Kick",
              "You cannot kick a user with an equal or higher role than you.",
            ),
          ],
        });
      }

      if (!member.kickable) {
        return await interaction.editReply({
          embeds: [
            errorEmbed(
              "Bot Hierarchy Error",
              "I cannot kick this user. Please check my role position relative to the target user.",
            ),
          ],
        });
      }

      await member.kick(reason);

      const caseId = await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: "Member Kicked",
          target: `${targetUser.tag} (${targetUser.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          metadata: {
            userId: targetUser.id,
            moderatorId: interaction.user.id
          }
        }
      });

      await interaction.editReply({
        embeds: [
          successEmbed(
            `👢 **Kicked** ${targetUser.tag}\n**Reason:** ${reason}`,
          ),
        ],
      });
    } catch (error) {
      logger.error("Kick Error:", error);
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "An unexpected error occurred while trying to kick the user.",
          ),
        ],
      });
    }
  }
};
