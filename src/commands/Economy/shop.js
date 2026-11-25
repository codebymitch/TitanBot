import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { adjustBerries, cleanName, loadShops, saveConfig } from '../../services/berryRpg.js';
import { formatCurrency, getEconomyData, setEconomyData } from '../../utils/economy.js';

const slug = value => cleanName(value).toLowerCase();

async function getLinkedChannelText(client, shop) {
  const targetId = shop.forumThreadId || shop.forumChannelId;
  if (!targetId) return '';
  const channel = await client.channels.fetch(targetId).catch(() => null);
  if (!channel) return '';

  let text = '';
  if (channel.isThread?.()) {
    const starter = await channel.fetchStarterMessage().catch(() => null);
    text = starter?.content?.trim() || '';
  } else if (channel.type === ChannelType.GuildForum) {
    const active = await channel.threads.fetchActive().catch(() => null);
    const thread = active?.threads?.first();
    const starter = thread ? await thread.fetchStarterMessage().catch(() => null) : null;
    text = starter?.content?.trim() || '';
  } else if (channel.isTextBased?.() && !channel.isDMBased?.()) {
    const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    text = messages?.first()?.content?.trim() || '';
  }
  return text.slice(0, 700);
}

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse a shop or buy one item with Berries.')
    .addStringOption(option => option.setName('shop').setDescription('Shop or forum post').setAutocomplete(true))
    .addStringOption(option => option.setName('item').setDescription('Choose an item to buy').setAutocomplete(true)),

  async autocomplete(interaction, client) {
    const shops = await loadShops(client, interaction.guildId);
    const focused = interaction.options.getFocused(true);
    const query = String(focused.value || '').toLowerCase();
    if (focused.name === 'shop') {
      return interaction.respond(Object.values(shops).filter(shop => shop.enabled !== false)
        .filter(shop => shop.name.toLowerCase().includes(query)).slice(0, 25)
        .map(shop => ({ name: shop.name, value: shop.name })));
    }
    const shopName = interaction.options.getString('shop');
    const shop = Object.values(shops).find(item => item.name.toLowerCase() === String(shopName || '').toLowerCase());
    const items = shop?.items || [];
    return interaction.respond(items.filter(item => item.stock > 0 && item.name.toLowerCase().includes(query)).slice(0, 25)
      .map(item => ({ name: item.name + ' — ' + formatCurrency(item.price) + ' (' + item.stock + ' left)', value: item.name })));
  },

  async execute(interaction, config, client) {
    const shops = await loadShops(client, interaction.guildId);
    const shopName = interaction.options.getString('shop');
    const itemName = interaction.options.getString('item');
    if (!shopName) {
      const available = Object.values(shops).filter(shop => shop.enabled !== false);
      const body = available.length
        ? available.map(shop => '• **' + shop.name + '** — ' + shop.items.filter(item => item.stock > 0).length + ' items' + (shop.forumUrl ? ' ([forum post](' + shop.forumUrl + '))' : '')).join('\n')
        : 'No shops are set up yet. A server administrator can use /shopadmin to create one.';
      return interaction.reply({ content: '🏬 **Available shops**\n' + body + '\n\nUse /shop shop:<name> to browse a shop. Add item:<name> to buy it.', ephemeral: true });
    }

    const shopKey = slug(shopName);
    const shop = shops[shopKey] || Object.values(shops).find(value => value.name.toLowerCase() === shopName.toLowerCase());
    if (!shop || shop.enabled === false) return interaction.reply({ content: 'That shop is not available.', ephemeral: true });

    if (!itemName) {
      const items = shop.items.filter(item => item.stock > 0);
      const body = items.length ? items.map(item => '• **' + item.name + '** — ' + formatCurrency(item.price) + ' — ' + item.stock + ' left' + (item.description ? '\n  ' + item.description : '')).join('\n') : 'This shop is sold out.';
      const postText = await getLinkedChannelText(client, shop);
      const linkedText = postText ? '\n\n📜 **Linked channel post**\n' + postText : '';
      return interaction.reply({ content: '🛍️ **' + shop.name + '**\n' + (shop.forumUrl ? shop.forumUrl + '\n' : '') + body + linkedText + '\n\nUse /shop shop:<name> item:<name> to buy.', ephemeral: true });
    }

    const item = shop.items.find(value => value.name.toLowerCase() === itemName.toLowerCase());
    if (!item || item.stock < 1) return interaction.reply({ content: 'That item is sold out or no longer listed.', ephemeral: true });
    try {
      const balance = await adjustBerries(client, interaction.guildId, interaction.user.id, -item.price);
      item.stock -= 1;
      if (item.stock === 0) shop.items = shop.items.filter(value => value !== item);
      shops[shopKey] = shop;
      await saveConfig(client, 'shops', interaction.guildId, shops);
      const account = await getEconomyData(client, interaction.guildId, interaction.user.id);
      const inventoryKey = 'shop_' + shopKey + '_' + slug(item.name).replaceAll(' ', '_');
      account.inventory[inventoryKey] = (account.inventory[inventoryKey] || 0) + 1;
      await setEconomyData(client, interaction.guildId, interaction.user.id, account);
      return interaction.reply({ content: '✅ You bought **' + item.name + '** for **' + formatCurrency(item.price) + '**. Remaining balance: **' + formatCurrency(balance) + '**.', ephemeral: true });
    } catch (error) {
      return interaction.reply({ content: error.message || 'Purchase failed. Please try again.', ephemeral: true });
    }
  }
};
