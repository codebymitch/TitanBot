import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Define the support server URL here so users in the tutorial can easily change it.
const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get link to the support server"),

  async execute(interaction) {
    try {
      const supportButton = new ButtonBuilder()
        .setLabel("Join Support Server")
        .setStyle(ButtonStyle.Link)
        .setURL(SUPPORT_SERVER_URL);

      const actionRow = new ActionRowBuilder().addComponents(supportButton);

      await interaction.editReply({
        embeds: [
          createEmbed({ title: "🚑 Need Help?", description: "Join our official support server for assistance, report bugs, or suggest features. If you are customizing this bot, remember to change the link in the code!" }),
        ],
        // Use the custom ActionRow with the defined button
        components: [actionRow],
        flags: ["Ephemeral"],
      });
    } catch (error) {
      console.error('Support command error:', error);
      return interaction.reply({
        embeds: [createEmbed({ title: 'System Error', description: 'Could not display support information.' })],
        ephemeral: true,
      });
    }
  },
};

