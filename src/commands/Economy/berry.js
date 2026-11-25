import { SlashCommandBuilder } from 'discord.js';
import { formatCurrency, getEconomyData } from '../../utils/economy.js';
import { adjustBerries, isStaff } from '../../services/berryRpg.js';
import { inventoryEntries } from '../../services/berryInventory.js';

export default {
  data: new SlashCommandBuilder()
    .setName('berry')
    .setDescription('Check or manage your Berry balance.')
    .addSubcommand(sub => sub.setName('balance').setDescription('Check your or another member’s Berries.')
      .addUserOption(option => option.setName('user').setDescription('Member to check')))
    .addSubcommand(sub => sub.setName('give').setDescription('Give a member Berries (staff only).')
      .addUserOption(option => option.setName('user').setDescription('Member receiving Berries').setRequired(true))
      .addIntegerOption(option => option.setName('amount').setDescription('Whole number of Berries').setMinValue(1).setRequired(true)))
    .addSubcommand(sub => sub.setName('inventory').setDescription('See items in a member’s inventory.')
      .addUserOption(option => option.setName('user').setDescription('Member whose inventory to check'))),

  async execute(interaction, config, client) {
    const action = interaction.options.getSubcommand();
    if (action === 'balance') {
      const user = interaction.options.getUser('user') || interaction.user;
      const account = await getEconomyData(client, interaction.guildId, user.id);
      return interaction.reply({ content: '<:Berry:1573798988988031087> **' + user.username + '** has **' + formatCurrency(account.wallet) + '**.', ephemeral: true });
    }

    if (action === 'inventory') {
      if (!isStaff(interaction)) return interaction.reply({ content: 'Viewing inventories requires the Admin staff role.', ephemeral: true });
      const user = interaction.options.getUser('user') || interaction.user;
      const account = await getEconomyData(client, interaction.guildId, user.id);
      const items = inventoryEntries(account);
      const lines = items.map(item => '• ' + item.name + ' × ' + item.count);
      if (account.heldItem?.name) lines.push('🗡️ In hand: ' + account.heldItem.name);
      const text = lines.length ? lines.join('\n') : 'No items yet.';
      return interaction.reply({ content: '🎒 **' + user.username + '’s inventory**\n' + text, ephemeral: true });
    }

    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (user.bot) return interaction.reply({ content: 'Berries can only be given to people.', ephemeral: true });
    const balance = await adjustBerries(client, interaction.guildId, user.id, amount);
    return interaction.reply({ content: '<:Berry:1573798988988031087> Gave **' + formatCurrency(amount) + '** to ' + user.toString() + '. Their new balance is **' + formatCurrency(balance) + '**.', ephemeral: true });
  }
};
