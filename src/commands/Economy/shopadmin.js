import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { cleanName, isStaff, loadShops, saveConfig } from '../../services/berryRpg.js';

const slug = value => cleanName(value).toLowerCase();
const postTypes = [ChannelType.PublicThread, ChannelType.AnnouncementThread];

function attachForumTarget(shop, guildId, forumChannel, forumPost) {
  if (!forumChannel && !forumPost) return;
  if (forumChannel && forumChannel.type !== ChannelType.GuildForum) {
    throw new Error('Choose a Forum channel in the forum option.');
  }
  if (forumPost && !postTypes.includes(forumPost.type)) {
    throw new Error('Choose a forum post thread in the forum post option.');
  }
  if (forumChannel && forumPost && forumPost.parentId !== forumChannel.id) {
    throw new Error('The selected post does not belong to the selected forum.');
  }

  const parentId = forumChannel?.id || forumPost?.parentId || null;
  const postId = forumPost?.id || null;
  shop.forumChannelId = parentId;
  shop.forumThreadId = postId;
  shop.forumUrl = postId
    ? 'https://discord.com/channels/' + guildId + '/' + postId
    : parentId ? 'https://discord.com/channels/' + guildId + '/' + parentId : null;
}

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
        { name: 'Link forum or forum post', value: 'link' },
        { name: 'Delete shop', value: 'delete' }
      ))
    .addStringOption(option => option.setName('shop').setDescription('Shop name').setRequired(true).setMaxLength(80))
    .addStringOption(option => option.setName('item').setDescription('Item name').setMaxLength(80))
    .addIntegerOption(option => option.setName('price').setDescription('Price in Berries').setMinValue(1).setMaxValue(100000000))
    .addIntegerOption(option => option.setName('stock').setDescription('Number available').setMinValue(0).setMaxValue(100000))
    .addStringOption(option => option.setName('description').setDescription('Short item description').setMaxLength(300))
    .addChannelOption(option => option.setName('forum').setDescription('Select the shop forum channel').addChannelTypes(ChannelType.GuildForum))
    .addChannelOption(option => option.setName('forum_post').setDescription('Select a specific post/thread').addChannelTypes(...postTypes)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can manage shops.', ephemeral: true });
    const action = interaction.options.getString('action');
    const name = cleanName(interaction.options.getString('shop'));
    const shopKey = slug(name);
    const itemName = cleanName(interaction.options.getString('item'));
    const forumChannel = interaction.options.getChannel('forum');
    const forumPost = interaction.options.getChannel('forum_post');
    const shops = await loadShops(client, interaction.guildId);

    if (action === 'create') {
      if (shops[shopKey]) return interaction.reply({ content: 'That shop already exists.', ephemeral: true });
      const shop = { name, enabled: true, items: [] };
      try {
        attachForumTarget(shop, interaction.guildId, forumChannel, forumPost);
      } catch (error) {
        return interaction.reply({ content: error.message, ephemeral: true });
      }
      shops[shopKey] = shop;
      await saveConfig(client, 'shops', interaction.guildId, shops);
      return interaction.reply({ content: 'Created shop **' + name + '**. Use /shopadmin action:add to add items. You can link a forum or specific post now or later.', ephemeral: true });
    }

    const shop = shops[shopKey];
    if (!shop) return interaction.reply({ content: 'I could not find that shop. Create it first with action:create.', ephemeral: true });

    if (action === 'delete') {
      delete shops[shopKey];
      await saveConfig(client, 'shops', interaction.guildId, shops);
      return interaction.reply({ content: 'Deleted shop **' + name + '** and its remaining listings.', ephemeral: true });
    }

    if (action === 'link') {
      if (!forumChannel && !forumPost) return interaction.reply({ content: 'Choose a forum channel, a forum post, or both from the Discord channel selectors.', ephemeral: true });
      try {
        attachForumTarget(shop, interaction.guildId, forumChannel, forumPost);
      } catch (error) {
        return interaction.reply({ content: error.message, ephemeral: true });
      }
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
