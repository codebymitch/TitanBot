import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

export default {
    data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the link to add this bot to your server"),

  async execute(interaction) {
try {
      const clientId = interaction.client.application.id;

      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

      const embed = createEmbed({ title: "🔗 Invite This Bot", description: "Click the button below to add your customized bot to a server. This link uses your bot's unique ID and requests Administrator permissions.", }).setThumbnail(interaction.client.user.displayAvatarURL());

      const inviteButton = new ButtonBuilder()
        .setLabel("Invite Bot")
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl);

      const actionRow = new ActionRowBuilder().addComponents(inviteButton);

      await interaction.reply({ embeds: [embed], components: [actionRow] });
    } catch (error) {
      console.error('Invite command error:', error);
      return interaction.editReply({
        embeds: [createEmbed({ title: 'System Error', description: 'Could not build the invite link.' })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};





