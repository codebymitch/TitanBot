import { SlashCommandBuilder } from 'discord.js';
import { cleanName, isStaff, loadMerchants, saveConfig } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('merchantadmin')
    .setDescription('Maintain regular and black market merchant stock.')
    .addStringOption(option => option.setName('action').setDescription('What to change').setRequired(true)
      .addChoices({ name: 'Add or restock item', value: 'add' }, { name: 'Remove item', value: 'remove' }, { name: 'Update stock', value: 'stock' }))
    .addStringOption(option => option.setName('type').setDescription('Merchant list').setRequired(true)
      .addChoices({ name: 'Regular Merchant', value: 'regular' }, { name: 'Black Market Merchant', value: 'black_market' }))
    .addStringOption(option => option.setName('item').setDescription('Item name').setRequired(true).setMaxLength(80))
    .addIntegerOption(option => option.setName('price').setDescription('Price in Berries').setMinValue(1).setMaxValue(100000000))
    .addIntegerOption(option => option.setName('stock').setDescription('Quantity available').setMinValue(0).setMaxValue(100000))
    .addStringOption(option => option.setName('description').setDescription('Short item description').setMaxLength(300)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can manage merchants.', ephemeral: true });
    const action = interaction.options.getString('action');
    const type = interaction.options.getString('type');
    const name = cleanName(interaction.options.getString('item'));
    const merchants = await loadMerchants(client, interaction.guildId);
    const list = merchants[type] || [];
    const index = list.findIndex(item => item.name.toLowerCase() === name.toLowerCase());

    if (action === 'add') {
      const price = interaction.options.getInteger('price');
      const stock = interaction.options.getInteger('stock') ?? 1;
      if (!price) return interaction.reply({ content: 'Set a price in Berries. For the Black Market, choose a higher price than the regular merchant.', ephemeral: true });
      const item = { name, price, stock, description: interaction.options.getString('description') || '' };
      if (index >= 0) list[index] = { ...list[index], ...item };
      else list.push(item);
    } else if (action === 'remove') {
      if (index < 0) return interaction.reply({ content: 'That item is not listed at this merchant.', ephemeral: true });
      list.splice(index, 1);
    } else if (action === 'stock') {
      const stock = interaction.options.getInteger('stock');
      if (index < 0 || stock === null) return interaction.reply({ content: 'Choose a listed item and set its new stock amount.', ephemeral: true });
      if (stock === 0) list.splice(index, 1);
      else list[index].stock = stock;
    }

    merchants[type] = list;
    await saveConfig(client, 'merchants', interaction.guildId, merchants);
    return interaction.reply({ content: 'Updated ' + (type === 'black_market' ? 'Black Market' : 'Regular') + ' Merchant stock. Use /merchant to see the changes.', ephemeral: true });
  }
};
