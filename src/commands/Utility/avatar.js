import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Utility/avatar.js
export default {
    data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Display a user's avatar image")
    .addUserOption((option) =>
      option
        .setName("target")
        .setDescription(
          "The user whose avatar you want to see (defaults to you)",
        ),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("target") || interaction.user;

    const embed = createEmbed({ title: `${user.username}'s Avatar`, description: `[Download Link](${user.displayAvatarURL({ size: 2048, dynamic: true })})` })
      .setImage(user.displayAvatarURL({ size: 2048, dynamic: true }));

    await interaction.reply({ embeds: [embed] });
  },
};
