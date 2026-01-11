import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Core/invite.js
export default {
    data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the link to add this bot to your server"),

  async execute(interaction) {
    // The bot's client ID is retrieved from the application object,
    // which ensures it works correctly for any user who hosts the bot.
    const clientId = interaction.client.application.id;

    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

    const embed = createEmbed(
      "🔗 Invite This Bot",
      "Click the button below to add your customized bot to a server. This link uses your bot's unique ID and requests Administrator permissions.",
    ).setThumbnail(interaction.client.user.displayAvatarURL());

    // Create the dedicated invite button
    const inviteButton = new ButtonBuilder()
      .setLabel("Invite Bot")
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl);

    const actionRow = new ActionRowBuilder().addComponents(inviteButton);

    await interaction.reply({ embeds: [embed], components: [actionRow] });
  },
};

