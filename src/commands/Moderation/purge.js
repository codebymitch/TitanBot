import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import {
  isPurgeOwner,
  canPurgeChannel,
  buildPurgeConfirmation,
} from '../../services/moderation/channelPurgeService.js';

// Wipes the whole channel. Owner only, and it waits for the owner to press Confirm.
// The prefix / no-prefix form (`purge`) is handled in messageCreate.
export default {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete every message in this channel (owner only, needs confirmation)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  category: "moderation",
  slashOnly: true,

  async execute(interaction) {
    if (!isPurgeOwner(interaction.user.id)) {
      return interaction.reply({ content: '🚫 Owner Only', flags: MessageFlags.Ephemeral });
    }
    if (!canPurgeChannel(interaction.channel)) {
      return interaction.reply({ content: '❌ Text Channels Only', flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ ...buildPurgeConfirmation(interaction.channel.id), flags: MessageFlags.Ephemeral });
  }
};
