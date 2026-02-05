import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';

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
  // safeExecute already defers; don't defer again

    // Ensure user has permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels))
      return await interaction.editReply({
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
        return await interaction.editReply({
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

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Channel Locked",
          target: channel.toString(),
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          metadata: {
            channelId: channel.id,
            category: channel.parent?.name || 'None',
            moderatorId: interaction.user.id
          }
        }
      });
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
  }
};
