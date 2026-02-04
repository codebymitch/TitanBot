import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { logEvent } from '../../utils/moderation.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
// Migrated from: commands/Moderation/purge.js
export default {
    data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete a specific amount of messages")
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("Number of messages (1-100)")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Requires Manage Messages permission
  category: "moderation",

  async execute(interaction, config, client) {
    await InteractionHelper.safeExecute(
      interaction,
      async () => {
    // safeExecute already defers; don't defer again

    // Ensure user has permission
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "Permission Denied",
            "You need the `Manage Messages` permission to purge messages.",
          ),
        ],
      });

    const amount = interaction.options.getInteger("amount");
    const channel = interaction.channel;

    if (amount < 1 || amount > 100)
      return await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "Invalid Amount",
            "Please specify a number between 1 and 100.",
          ),
        ],
      });

    try {
      // Bulk delete the messages, including the command message itself.
      const fetched = await channel.messages.fetch({ limit: amount });
      const deleted = await channel.bulkDelete(fetched, true);
      const deletedCount = deleted.size;

      // --- LOGGING THE ACTION ---
      const purgeEmbed = createEmbed(
        "🗑️ Messages Purged (Action Log)",
        `${deletedCount} messages were deleted by ${interaction.user}.`,
      )
        .setColor("#E67E22") // Orange for Deletion/Warning
        .addFields(
          { name: "Channel", value: channel.toString(), inline: true },
          {
            name: "Moderator",
            value: `${interaction.user.tag} (${interaction.user.id})`,
            inline: true,
          },
          { name: "Count", value: `${deletedCount} messages`, inline: false },
        );

      await logEvent({
        client,
        guild: interaction.guild,
        event: {
          action: "Messages Purged",
          target: `${channel} (${deletedCount} messages)`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason: `Deleted ${deletedCount} messages`,
          metadata: {
            channelId: channel.id,
            messageCount: deletedCount,
            requestedAmount: amount,
            moderatorId: interaction.user.id
          }
        }
      });
      // ---------------------------

      // Send ephemeral success message
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(`🗑️ Deleted ${deletedCount} messages in ${channel}.`),
        ],
        ephemeral: false, // Set to false to show the message publicly before deleting it
      });

      // Auto delete success message after 3 seconds for cleanliness
      setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
    } catch (error) {
      console.error("Purge Error:", error);
      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "An unexpected error occurred during message deletion. Note: Messages older than 14 days cannot be bulk deleted.",
          ),
        ],
        flags: ["Ephemeral"],
      });
    }
  
        },
        { title: 'Command Error', description: 'Failed to execute command. Please try again later.' }
    );
},
};
