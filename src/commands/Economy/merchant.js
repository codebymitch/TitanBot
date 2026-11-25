import { SlashCommandBuilder } from 'discord.js';
import { adjustBerries, berryLabel, cleanName, loadMerchants, saveConfig } from '../../services/berryRpg.js';
import { formatCurrency, getEconomyData, setEconomyData } from '../../utils/economy.js';

export default {
  data: new SlashCommandBuilder()
    .setName('merchant')
    .setDescription('Browse a merchant or buy a listed item.')
    .addStringOption(option => option.setName('type').setDescription('Merchant to visit').setRequired(true)
      .addChoices({ name: 'Regular Merchant', value: 'regular' }, { name: 'Black Market Merchant', value: 'black_market' }))
    .addStringOption(option => option.setName('item').setDescription('Item to buy (leave blank to browse)').setAutocomplete(true)),

  async autocomplete(interaction, client) {
    const type = interaction.options.getString('type');
    const merchants = await loadMerchants(client, interaction.guildId);
    const query = String(interaction.options.getFocused() || '').toLowerCase();
    return interaction.respond((merchants[type] || []).filter(item => item.stock > 0 && item.name.toLowerCase().includes(query)).slice(0, 25)
      .map(item => ({ name: item.name + ' — ' + formatCurrency(item.price) + ' (' + item.stock + ' left)', value: item.name })));
  },

  async execute(interaction, config, client) {
    const type = interaction.options.getString('type');
    const merchants = await loadMerchants(client, interaction.guildId);
    const list = merchants[type] || [];
    const itemName = interaction.options.getString('item');
    const title = type === 'black_market' ? '🕶️ Black Market Merchant' : '🧳 Regular Merchant';
    if (!itemName) {
      const items = list.filter(item => item.stock > 0);
      const text = items.length ? items.map(item => '• **' + item.name + '** — ' + formatCurrency(item.price) + ' — ' + item.stock + ' left' + (item.description ? '\n  ' + item.description : '')).join('\n') : 'This merchant has no stock right now.';
      return interaction.reply({ content: title + '\n' + text + '\n\nUse /merchant type:' + type + ' item:<name> to buy.', ephemeral: true });
    }

    const item = list.find(value => value.name.toLowerCase() === itemName.toLowerCase());
    if (!item || item.stock < 1) return interaction.reply({ content: 'That item is sold out or no longer listed.', ephemeral: true });
    try {
      const balance = await adjustBerries(client, interaction.guildId, interaction.user.id, -item.price);
      item.stock -= 1;
      merchants[type] = list.filter(value => value !== item || item.stock > 0);
      await saveConfig(client, 'merchants', interaction.guildId, merchants);
      const account = await getEconomyData(client, interaction.guildId, interaction.user.id);
      const key = 'merchant_' + type + '_' + cleanName(item.name).toLowerCase().replaceAll(' ', '_');
      account.inventory[key] = (account.inventory[key] || 0) + 1;
      account.inventoryMeta ||= {};
      account.inventoryMeta[key] = { name: item.name, source: 'merchant' };
      await setEconomyData(client, interaction.guildId, interaction.user.id, account);
      return interaction.reply({ content: '✅ Bought **' + item.name + '** for **' + formatCurrency(item.price) + '**. You have **' + balance.toLocaleString() + ' Berries** left.', ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: error.message || 'Purchase failed. Please try again.', ephemeral: true });
    }
  }
};
