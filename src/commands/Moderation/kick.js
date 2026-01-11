import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Moderation/kick.js
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
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers), // Requires Kick Members permission
  category: "moderation",

  async execute(interaction, config, client) {
    await interaction.deferReply({ ephemeral: true });

    // Permission check (redundant, but safe)
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers))
      return interaction.editReply({
        embeds: [
          errorEmbed(
            "Permission Denied",
            "You do not have permission to kick members.",
          ),
        ],
      });

    const targetUser = interaction.options.getUser("target");
    // Get the GuildMember object (required for kicking and hierarchy checks)
    const member = interaction.options.getMember("target");
    const reason =
      interaction.options.getString("reason") || "No reason provided";

    // Prevent self/bot kicking
    if (targetUser.id === interaction.user.id) {
      return interaction.editReply({
        embeds: [errorEmbed("You cannot kick yourself.")],
      });
    }
    if (targetUser.id === client.user.id) {
      return interaction.editReply({
        embeds: [errorEmbed("You cannot kick the bot.")],
      });
    }

    if (!member) {
      return interaction.editReply({
        embeds: [
          errorEmbed(
            "Target Not Found",
            "The target user is not currently in this server, and therefore cannot be kicked.",
          ),
        ],
      });
    }

    try {
      // 1. Moderator Hierarchy Check: Can the moderator kick the target?
      if (
        interaction.member.roles.highest.position <=
        member.roles.highest.position
      ) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              "Cannot Kick",
              "You cannot kick a user with an equal or higher role than you.",
            ),
          ],
        });
      }

      // 2. Bot Hierarchy Check: Can the bot kick the target?
      // member.kickable checks if the bot has the permission AND hierarchy
      if (!member.kickable) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              "Bot Hierarchy Error",
              "I cannot kick this user. Please check my role position relative to the target user.",
            ),
          ],
        });
      }

      await member.kick(reason);

      // --- LOGGING THE ACTION ---
      const kickEmbed = new EmbedBuilder()
        .setColor("#FFA500") // Orange
        .setTitle("👢 Member Kicked (Action Log)")
        .setDescription(`${targetUser.tag} has been kicked from the server.`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
          {
            name: "Target User",
            value: `${targetUser.tag} (${targetUser.id})`,
            inline: false,
          },
          {
            name: "Moderator",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
          { name: "Reason", value: reason, inline: false },
        )
        .setTimestamp();

      logEvent(client, interaction.guildId, kickEmbed);
      // ---------------------------

      await interaction.editReply({
        embeds: [
          successEmbed(
            `👢 **Kicked** ${targetUser.tag}\n**Reason:** ${reason}`,
          ),
        ],
      });
    } catch (error) {
      console.error("Kick Error:", error);
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "An unexpected error occurred while trying to kick the user.",
          ),
        ],
      });
    }
  },
};
