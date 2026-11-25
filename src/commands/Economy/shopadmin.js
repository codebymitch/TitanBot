import { SlashCommandBuilder } from 'discord.js';
import { cleanName, isStaff, loadShops, saveConfig } from '../../services/berryRpg.js';

const slug = value => cleanName(value).toLowerCase();

export default {
  data: new SlashCommandBuilder()
    .setName('shopadmin')
    .setDescription('Create and maintain Berry shops.')
    .addStringOption(option => option.setName('action').setDescription('What to change').setRequired(true)
      .addChoices(
        { name: 'Create shop', value: 'create' },
        { name: 'Add or restock item', value: 'add' },
        { name: 'Remove item', value: 'remove' },
        { name: 'Update stock', value: 'stock' },
        { name: 'Set forum post link', value: 'link' },
        { name: 'Delete shop', value: 'delete' }
      ))
    .addStringOption(option => option.setName('shop').setDescription('Shop name').setRequired(true).setMaxLength(80))
    .addStringOption(option => option.setName('item').setDescription('Item name').setMaxLength(80))
    .addIntegerOption(option => option.setName('price').setDescription('Price in Berries').setMinValue(1).setMaxValue(100000000))
    .addIntegerOption(option => option.setName('stock').setDescription('Number available').setMinValue(0).setMaxValue(100000))
    .addStringOption(option => option.setName('description').setDescription('Short item description').setMaxLength(300))
    .addStringOption(option => option.setName('forum_url').setDescription('URL of the matching forum post').setMaxLength(300)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can manage shops.', ephemeral: true });
    const action = interaction.options.getString('action');
    const name = cleanName(interaction.options.getString('shop'));
    const shopKey = slug(name);
    const itemName = cleanName(interaction.options.getString('item'));
    const shops = await loadShops(client, interaction.guildId);

    if (action === 'create') {
      if (shops[shopKey]) return interaction.reply({ content: 'That shop already exists.', ephemeral: true });
      shops[shopKey] = { name, forumUrl: interaction.options.getString('forum_url'), enabled: true, items: [] };
      await saveConfig(client, 'shops', interaction.guildId, shops);
      return interaction.reply({ content: 'Created shop **' + name + '**. Use /shopadmin action:add to add items.', ephemeral: true });
    }

    const shop = shops[shopKey];
    if (!shop) return interaction.reply({ content: 'I could not find that shop. Create it first with action:create.', ephemeral: true });

    if (action === 'delete') {
      delete shops[shopKey];
      await saveConfig(client, 'shops', interaction.guildId, shops);
      return interaction.reply({ content: 'Deleted shop **' + name + '** and its remaining listings.', ephemeral: true });
    }

    if (action === 'link') {
      const url = interaction.options.getString('forum_url');
      if (!url || !/^https:\/\/(discord\.com|discordapp\.com)\//i.test(url)) return interaction.reply({ content: 'Enter a Discord forum post URL.', ephemeral: true });
      shop.forumUrl = url;
    } else {
      if (!itemName) return interaction.reply({ content: 'Provide an item name.', ephemeral: true });
      const index = shop.items.findIndex(item => item.name.toLowerCase() === itemName.toLowerCase());
      if (action === 'add') {
        const price = interaction.options.getInteger('price');
        const stock = interaction.options.getInteger('stock') ?? 1;
        if (!price) return interaction.reply({ content: 'Set a price in Berries.', ephemeral: true });
        const item = { name: itemName, price, stock, description: interaction.options.getString('description') || '' };
        if (index >= 0) shop.items[index] = { ...shop.items[index], ...item };
        else shop.items.push(item);
      } else if (action === 'remove') {
        if (index < 0) return interaction.reply({ content: 'That item is not listed in this shop.', ephemeral: true });
        shop.items.splice(index, 1);
      } else if (action === 'stock') {
        const stock = interaction.options.getInteger('stock');
        if (index < 0 || stock === null) return interaction.reply({ content: 'Choose a listed item and set its new stock amount.', ephemeral: true });
        if (stock === 0) shop.items.splice(index, 1);
        else shop.items[index].stock = stock;
      }
    }

    await saveConfig(client, 'shops', interaction.guildId, shops);
    return interaction.reply({ content: 'Updated **' + name + '**. Changes are available in /shop right away.', ephemeral: true });
  }
};
