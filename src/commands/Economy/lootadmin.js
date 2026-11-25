import { SlashCommandBuilder } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { cleanName, isStaff, loadLoot, saveConfig } from '../../services/berryRpg.js';
import { isForumPost } from '../../services/berryLootPosts.js';

const rarityChoices = [
  { name: 'Common', value: 'common' },
  { name: 'Rare', value: 'rare' },
  { name: 'Epic', value: 'epic' }
];
const itemKinds = [
  { name: 'Berry stack', value: 'berry' },
  { name: 'Weapon', value: 'weapon' },
  { name: 'Devil Fruit', value: 'devil_fruit' },
  { name: 'Other item', value: 'item' }
];
const makeChest = () => ({ id: randomUUID(), items: [] });
const postName = channel => channel.name || ('Forum post ' + channel.id);

function selectedForumPost(interaction) {
  return interaction.options.getChannel('location');
}

function getChest(post, number) {
  if (!Number.isInteger(number) || number < 1) return null;
  return post?.chests?.[number - 1] || null;
}

function parseManualList(raw, post) {
  const lines = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Add at least one item line.');
  if (lines.length > 25) throw new Error('A location can have at most 25 item stacks. Combine matching items and raise their quantity.');
  const itemsByChest = new Map();

  for (const [index, line] of lines.entries()) {
    const [chestText, itemText, kindText, quantityText] = line.split('|').map(value => value.trim());
    const chestNumber = Number(chestText);
    const itemName = cleanName(itemText);
    const kind = kindText?.toLowerCase().replaceAll(' ', '_');
    const quantity = Number(quantityText);
    if (!getChest(post, chestNumber)) throw new Error('Line ' + (index + 1) + ' uses a chest number that does not exist.');
    if (!itemName || !['berry', 'weapon', 'devil_fruit', 'item'].includes(kind)) {
      throw new Error('Line ' + (index + 1) + ' must be: chest number | item name | berry/weapon/devil_fruit/item | quantity.');
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000000) {
      throw new Error('Line ' + (index + 1) + ' needs a whole quantity from 1 to 1,000,000,000.');
    }
    const chestId = getChest(post, chestNumber).id;
    if (!itemsByChest.has(chestId)) itemsByChest.set(chestId, []);
    itemsByChest.get(chestId).push({ id: randomUUID(), name: itemName, kind, quantity });
  }
  return itemsByChest;
}

function postSummary(post) {
  return Object.values(post || {}).slice(0, 25).map(entry => {
    const chestText = (entry.chests || []).map((chest, index) => {
      const contents = (chest.items || []).filter(item => item.quantity > 0)
        .map(item => item.kind === 'berry' ? item.name + ' (' + item.quantity.toLocaleString() + ' Berries)' : item.name + ' × ' + item.quantity)
        .join(', ');
      return (index + 1) + ': ' + (contents || 'empty');
    }).join(' | ');
    return '• **' + entry.name + '** — ' + (entry.chests || []).length + ' chest(s)' + (chestText ? '\n  ' + chestText : '');
  }).join('\n').slice(0, 3900);
}

export default {
  data: new SlashCommandBuilder()
    .setName('lootadmin')
    .setDescription('Set up chest loot on Forum posts (Admin role required).')
    .addStringOption(option => option.setName('action').setDescription('What to configure').setRequired(true)
      .addChoices(
        { name: 'List configured posts', value: 'list' },
        { name: 'Set up empty chests', value: 'setup' },
        { name: 'Guided: fill chests from a rarity table', value: 'guided' },
        { name: 'Set chest count', value: 'set_count' },
        { name: 'Add item to a chest', value: 'add_item' },
        { name: 'Remove item from a chest', value: 'remove_item' },
        { name: 'Manually replace chest item lists', value: 'manual' },
        { name: 'Clear one chest', value: 'clear' },
        { name: 'Remove this location', value: 'remove_location' },
        { name: 'Add to guided rarity table', value: 'table_add' },
        { name: 'Remove from guided rarity table', value: 'table_remove' }
      ))
    .addChannelOption(option => option.setName('location').setDescription('Choose a Forum post for this location'))
    .addIntegerOption(option => option.setName('chest_count').setDescription('Number of chests (1 to 20)').setMinValue(1).setMaxValue(20))
    .addIntegerOption(option => option.setName('chest_number').setDescription('Chest number to edit (starts at 1)').setMinValue(1).setMaxValue(20))
    .addStringOption(option => option.setName('item').setDescription('Item name for guided changes').setMaxLength(80))
    .addStringOption(option => option.setName('kind').setDescription('Item type').addChoices(...itemKinds))
    .addIntegerOption(option => option.setName('quantity').setDescription('Copies, or Berry amount for a Berry stack').setMinValue(1).setMaxValue(1000000000))
    .addStringOption(option => option.setName('rarity').setDescription('Rarity table for guided setup').addChoices(...rarityChoices))
    .addStringOption(option => option.setName('manual_list').setDescription('One line per item: chest | name | kind | quantity').setMaxLength(1500)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    const action = interaction.options.getString('action');
    const loot = await loadLoot(client, interaction.guildId);
    loot.posts ||= {};

    if (action === 'list') {
      const list = postSummary(loot.posts);
      return interaction.reply({ content: '🗺️ **Configured Forum post chests**\n' + (list || 'No Forum posts have chest settings yet.'), ephemeral: true });
    }

    if (action === 'table_add' || action === 'table_remove') {
      const rarity = interaction.options.getString('rarity');
      const itemName = cleanName(interaction.options.getString('item'));
      if (!rarity || !itemName) return interaction.reply({ content: 'Choose a rarity and enter an item name.', ephemeral: true });
      const kind = interaction.options.getString('kind') || 'item';
      loot.tables[rarity] ||= [];
      if (action === 'table_add') {
        if (!loot.tables[rarity].some(entry => entry.name.toLowerCase() === itemName.toLowerCase())) {
          loot.tables[rarity].push({ name: itemName, kind });
        }
      } else {
        loot.tables[rarity] = loot.tables[rarity].filter(entry => entry.name.toLowerCase() !== itemName.toLowerCase());
      }
      await saveConfig(client, 'loot', interaction.guildId, loot);
      return interaction.reply({ content: action === 'table_add' ? 'Added **' + itemName + '** to the ' + rarity + ' guided table.' : 'Removed **' + itemName + '** from the ' + rarity + ' guided table.', ephemeral: true });
    }

    const location = selectedForumPost(interaction);
    if (!location || !await isForumPost(location)) {
      return interaction.reply({ content: 'Choose a post inside a Forum channel in the location option.', ephemeral: true });
    }
    const stored = loot.posts[location.id];
    const chestCount = interaction.options.getInteger('chest_count');
    const chestNumber = interaction.options.getInteger('chest_number');
    const itemName = cleanName(interaction.options.getString('item'));
    const kind = interaction.options.getString('kind') || 'item';
    const quantity = interaction.options.getInteger('quantity') || 1;

    if (action === 'setup') {
      if (stored) return interaction.reply({ content: 'This Forum post already has chest settings. Use Set chest count or edit its contents instead of resetting it.', ephemeral: true });
      if (!chestCount) return interaction.reply({ content: 'Set a chest count from 1 to 20.', ephemeral: true });
      loot.posts[location.id] = { name: postName(location), parentId: location.parentId, chests: Array.from({ length: chestCount }, makeChest), updatedAt: Date.now() };
      await saveConfig(client, 'loot', interaction.guildId, loot);
      return interaction.reply({ content: '📦 Set up **' + chestCount + '** empty chest(s) for **' + postName(location) + '**. Add contents with Add item or Manually replace chest item lists.', ephemeral: true });
    }

    if (action === 'guided') {
      if (stored) return interaction.reply({ content: 'This Forum post already has chest settings. Use Set chest count or edit its contents instead of replacing it.', ephemeral: true });
      const rarity = interaction.options.getString('rarity');
      if (!chestCount || !rarity) return interaction.reply({ content: 'Choose a rarity and chest count from 1 to 20.', ephemeral: true });
      const table = loot.tables[rarity] || [];
      if (!table.length) return interaction.reply({ content: 'The ' + rarity + ' guided table is empty. Use Add to guided rarity table first.', ephemeral: true });
      loot.posts[location.id] = {
        name: postName(location),
        parentId: location.parentId,
        chests: Array.from({ length: chestCount }, () => {
          const entry = table[Math.floor(Math.random() * table.length)];
          return { id: randomUUID(), items: [{ id: randomUUID(), name: entry.name, kind: entry.kind || 'item', quantity }] };
        }),
        updatedAt: Date.now()
      };
      await saveConfig(client, 'loot', interaction.guildId, loot);
      return interaction.reply({ content: '🎲 Filled **' + chestCount + '** chests for **' + postName(location) + '** using the ' + rarity + ' table.', ephemeral: true });
    }

    if (!stored && action !== 'remove_location') {
      return interaction.reply({ content: 'This Forum post has no chest setup yet. Use Setup empty chests or Guided setup first.', ephemeral: true });
    }

    if (action === 'remove_location') {
      if (!stored) return interaction.reply({ content: 'This Forum post has no chest setup.', ephemeral: true });
      delete loot.posts[location.id];
    } else if (action === 'set_count') {
      if (!chestCount) return interaction.reply({ content: 'Set a chest count from 1 to 20.', ephemeral: true });
      if (chestCount < stored.chests.length && stored.chests.slice(chestCount).some(chest => chest.items?.some(item => item.quantity > 0))) {
        return interaction.reply({ content: 'The extra chests contain loot. Remove or clear their items before lowering the chest count.', ephemeral: true });
      }
      stored.chests = stored.chests.slice(0, chestCount);
      while (stored.chests.length < chestCount) stored.chests.push(makeChest());
      stored.updatedAt = Date.now();
    } else if (action === 'add_item') {
      const chest = getChest(stored, chestNumber);
      if (!chest || !itemName) return interaction.reply({ content: 'Choose a valid chest number and item name.', ephemeral: true });
      const activeStacks = stored.chests.reduce((sum, entry) => sum + (entry.items || []).filter(item => item.quantity > 0).length, 0);
      if (activeStacks >= 25) return interaction.reply({ content: 'This location already has 25 item stacks. Raise an existing stack with the manual list instead.', ephemeral: true });
      chest.items.push({ id: randomUUID(), name: itemName, kind, quantity });
      stored.updatedAt = Date.now();
    } else if (action === 'remove_item') {
      const chest = getChest(stored, chestNumber);
      if (!chest || !itemName) return interaction.reply({ content: 'Choose a valid chest number and enter the exact item name.', ephemeral: true });
      const itemIndex = chest.items.findIndex(item => item.name.toLowerCase() === itemName.toLowerCase());
      if (itemIndex < 0) return interaction.reply({ content: 'That item is not in this chest.', ephemeral: true });
      chest.items.splice(itemIndex, 1);
      stored.updatedAt = Date.now();
    } else if (action === 'clear') {
      const chest = getChest(stored, chestNumber);
      if (!chest) return interaction.reply({ content: 'Choose a valid chest number.', ephemeral: true });
      chest.items = [];
      stored.updatedAt = Date.now();
    } else if (action === 'manual') {
      const manual = interaction.options.getString('manual_list');
      try {
        const itemsByChest = parseManualList(manual, stored);
        for (const chest of stored.chests) chest.items = itemsByChest.get(chest.id) || [];
      } catch (error) {
        return interaction.reply({ content: error.message, ephemeral: true });
      }
      stored.updatedAt = Date.now();
    }

    await saveConfig(client, 'loot', interaction.guildId, loot);
    return interaction.reply({ content: action === 'remove_location' ? 'Removed chest setup for **' + postName(location) + '**.' : 'Updated chest loot for **' + postName(location) + '**.', ephemeral: true });
  }
};
