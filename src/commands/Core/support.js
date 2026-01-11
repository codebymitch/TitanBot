import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Define the support server URL here so users in the tutorial can easily change it.
const SUPPORT_SERVER_URL = "https://discord.gg/QnWNz2dKCE";
export default {
    data: new SlashCommandBuilder()
    .setName("support")
    .setDescription("Get link to the support server"),

  async execute(interaction) {
    const supportButton = new ButtonBuilder()
      .setLabel("Join Support Server")
      .setStyle(ButtonStyle.Link)
      .setURL(SUPPORT_SERVER_URL);

    const actionRow = new ActionRowBuilder().addComponents(supportButton);

    await interaction.reply({
      embeds: [
        createEmbed(
          "🚑 Need Help?",
          "Join our official support server for assistance, report bugs, or suggest features. If you are customizing this bot, remember to change the link in the code!",
        ),
      ],
      // Use the custom ActionRow with the defined button
      components: [actionRow],
      ephemeral: true,
    });
  },
};

