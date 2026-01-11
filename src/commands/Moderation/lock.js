import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Moderation/lock.js
export default {
    data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription(
      "Locks the current channel (prevents @everyone from sending messages).",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels), // Requires Manage Channels permission
  category: "moderation",

  async execute(interaction, config, client) {
    // Defer reply for potential API latency
    await interaction.deferReply({ ephemeral: true });

    // Ensure user has permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.editReply({
        embeds: [
          errorEmbed(
            "Permission Denied",
            "You need the `Manage Channels` permission to lock channels.",
          ),
        ],
      });

    const channel = interaction.channel;
    const everyoneRole = interaction.guild.roles.everyone;

    try {
      // Check if the channel is already locked (optional but good UX)
      const currentPermissions = channel.permissionsFor(everyoneRole);
      // Check if SendMessages is explicitly denied or implicitly denied
      if (currentPermissions.has(PermissionFlagsBits.SendMessages) === false) {
        return interaction.editReply({
          embeds: [
            errorEmbed(
              "Channel Already Locked",
              `${channel} is already locked.`,
            ),
          ],
        });
      }

      // Lock the channel: Deny the SendMessages permission for @everyone
      await channel.permissionOverwrites.edit(
        everyoneRole,
        { SendMessages: false },
        { type: 0, reason: `Channel locked by ${interaction.user.tag}` }, // type 0 is the default role type
      );

      // --- LOGGING THE ACTION ---
      const lockEmbed = createEmbed(
        "🔒 Channel Locked (Action Log)",
        `${channel} has been locked down by ${interaction.user}.`,
      )
        .setColor("#CC00CC") // Purple/Magenta for Configuration/State Change
        .addFields(
          { name: "Channel", value: channel.toString(), inline: true },
          {
            name: "Moderator",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
        );

      logEvent(client, interaction.guildId, lockEmbed);
      // ---------------------------

      await interaction.editReply({
        embeds: [
          successEmbed(
            `🔒 **Channel Locked**`,
            `${channel} is now locked down. No one can speak here now.`,
          ),
        ],
      });
    } catch (error) {
      console.error("Lock Error:", error);
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "An unexpected error occurred while trying to lock the channel. Check my permissions (I need 'Manage Channels').",
          ),
        ],
      });
    }
  },
};
