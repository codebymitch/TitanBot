import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { adjustBerries, berryLabel, isStaff } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('berry')
    .setDescription('Check or manage your Berry balance.')
    .addSubcommand(sub => sub.setName('balance').setDescription('Check your or another member’s Berries.')
      .addUserOption(option => option.setName('user').setDescription('Member to check')))
    .addSubcommand(sub => sub.setName('give').setDescription('Give a member Berries (staff only).')
      .addUserOption(option => option.setName('user').setDescription('Member receiving Berries').setRequired(true))
      .addIntegerOption(option => option.setName('amount').setDescription('Whole number of Berries').setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName('inventory').setDescription('See items you have found in chests.')
      .addUserOption(option => option.setName('user').setDescription('Member whose inventory to check'))),

  async execute(interaction, config, client) {
    const action = interaction.options.getSubcommand();
    if (action === 'balance') {
      const user = interaction.options.getUser('user') || interaction.user;
      const account = await getEconomyData(client, interaction.guildId, user.id);
      return interaction.reply({ content: '<:Berry:1573798988988031087> **' + user.username + '** has **' + account.wallet.toLocaleString() + ' ' + berryLabel(account.wallet) + '**.', ephemeral: true });
    }

    if (action === 'inventory') {
      const user = interaction.options.getUser('user') || interaction.user;
      const account = await getEconomyData(client, interaction.guildId, user.id);
      const items = Object.entries(account.inventory || {}).filter(([name, count]) => name.startsWith('loot_') && count > 0);
      const text = items.length ? items.map(([name, count]) => '• ' + name.slice(5).replaceAll('_', ' ') + ' × ' + count).join('\n') : 'No loot items yet.';
      return interaction.reply({ content: '🎒 **' + user.username + '’s loot inventory**\n' + text, ephemeral: true });
    }

    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'Only server administrators or members with Manage Server can give Berries.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (user.bot) return interaction.reply({ content: 'Berries can only be given to people.', ephemeral: true });
    const balance = await adjustBerries(client, interaction.guildId, user.id, amount);
    return interaction.reply({ content: '<:Berry:1573798988988031087> Gave **' + amount.toLocaleString() + ' Berries** to ' + user.toString() + '. Their new balance is **' + balance.toLocaleString() + ' Berries**.', ephemeral: true });
  }
};
