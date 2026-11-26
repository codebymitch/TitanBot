import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { getEconomyData, formatCurrency } from '../../utils/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('equipped')
    .setDescription('See what you or another member currently has equipped.')
    .addUserOption(option => option.setName('user').setDescription('Member whose equipped item you want to see.')),

  async execute(interaction, config, client) {
    const target = interaction.options.getUser('user') || interaction.user;
    const account = await getEconomyData(client, interaction.guildId, target.id);
    const heldItem = account.heldItem;

    const embed = new EmbedBuilder()
      .setColor(0x17324D)
      .setTitle('⚔️ Grand Line Equipment')
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .setDescription(heldItem?.name
        ? '**' + target.username + '** currently has **' + heldItem.name + '** equipped.'
        : '**' + target.username + '** has nothing equipped right now.')
      .setFooter({ text: 'Public equipment check • Grand Line' });

    const worth = heldItem?.metadata?.worth;
    if (Number.isSafeInteger(worth) && worth >= 0) {
      embed.addFields({ name: 'Estimated worth', value: formatCurrency(worth), inline: true });
    }

    const kind = heldItem?.metadata?.kind;
    if (kind) {
      const kindLabel = kind === 'devil_fruit'
        ? 'Devil Fruit'
        : kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll('_', ' ');
      embed.addFields({ name: 'Type', value: kindLabel, inline: true });
    }

    return interaction.reply({ embeds: [embed] });
  }
};
