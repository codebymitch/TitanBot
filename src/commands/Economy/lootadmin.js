import { ChannelType, SlashCommandBuilder } from 'discord.js';
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

function postSummary(posts) {
  return Object.values(posts || {}).slice(0, 20).map(entry => {
    const chestText = (entry.chests || []).map((chest, index) => {
      const contents = (chest.items || []).filter(item => item.quantity > 0)
        .map(item => item.kind === 'berry'
          ? item.name + ' (' + item.quantity.toLocaleString() + ' Berries)'
          : item.name + ' × ' + item.quantity)
        .join(', ');
      return 'Chest ' + (index + 1) + ': ' + (contents || 'empty');
    }).join('\n');
    return '• **' + entry.name + '** — ' + (entry.chests || []).length + ' chest(s)' + (chestText ? '\n' + chestText : '');
  }).join('\n\n').slice(0, 3900);
}

function tableSummary(tables) {
  return rarityChoices.map(({ name, value }) => {
    const entries = tables?.[value] || [];
    return '**' + name + '**: ' + (entries.length
      ? entries.map(entry => entry.name + ' (' + (entry.kind || 'item') + ')').join(', ')
      : 'No items yet');
  }).join('\n').slice(0, 3900);
}

function addLocationOption(subcommand) {
  return subcommand.addChannelOption(option => option.setName('location')
    .setDescription('Pick the Forum post where these chests belong')
    .addChannelTypes(ChannelType.PublicThread)
    .setRequired(true));
}

function addItemKindOption(subcommand) {
  return subcommand.addStringOption(option => option.setName('kind')
    .setDescription('Choose the item type (defaults to Other item)')
    .addChoices(...itemKinds));
}

function addQuantityOption(subcommand) {
  return subcommand.addIntegerOption(option => option.setName('quantity')
    .setDescription('Amount to add (defaults to 1; Berries use this full amount)')
    .setMinValue(1)
    .setMaxValue(1000000000));
}

export default {
  data: new SlashCommandBuilder()
    .setName('lootadmin')
    .setDescription('Manage chest loot on Forum posts (Admin role required).')
    .addSubcommand(subcommand => subcommand.setName('help')
      .setDescription('Show a quick guide to setting up chest loot'))
    .addSubcommand(subcommand => subcommand.setName('list')
      .setDescription('Show every configured chest location and its remaining loot'))
    .addSubcommand(subcommand => subcommand.setName('setup')
      .setDescription('Create empty chests at a Forum post')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post where these chests belong')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addIntegerOption(option => option.setName('chests')
        .setDescription('How many empty chests to create (1 to 20)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('guided-setup')
      .setDescription('Create chests with random items from one rarity table')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post where these chests belong')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addStringOption(option => option.setName('rarity')
        .setDescription('Choose the rarity table to draw from')
        .addChoices(...rarityChoices)
        .setRequired(true))
      .addIntegerOption(option => option.setName('chests')
        .setDescription('How many chests to create (1 to 20)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true))
      .addIntegerOption(option => option.setName('quantity')
        .setDescription('Amount in each chest (defaults to 1)')
        .setMinValue(1)
        .setMaxValue(1000000000)))
    .addSubcommand(subcommand => subcommand.setName('set-count')
      .setDescription('Change how many chests a Forum post has')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post to update')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addIntegerOption(option => option.setName('chests')
        .setDescription('New total number of chests (1 to 20)')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('add-item')
      .setDescription('Put an item or Berry stack into one chest')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post to update')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addIntegerOption(option => option.setName('chest')
        .setDescription('Chest number, starting at 1')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true))
      .addStringOption(option => option.setName('item')
        .setDescription('Name shown to players')
        .setMaxLength(80)
        .setRequired(true))
      .addIntegerOption(option => option.setName('quantity')
        .setDescription('How many; Berries use this as the Berry amount (defaults to 1)')
        .setMinValue(1)
        .setMaxValue(1000000000))
      .addStringOption(option => option.setName('kind')
        .setDescription('Choose the item type (defaults to Other item)')
        .addChoices(...itemKinds)))
    .addSubcommand(subcommand => subcommand.setName('remove-item')
      .setDescription('Remove a named item from one chest')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post to update')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addIntegerOption(option => option.setName('chest')
        .setDescription('Chest number, starting at 1')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true))
      .addStringOption(option => option.setName('item')
        .setDescription('Enter the exact item name to remove')
        .setMaxLength(80)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('replace-list')
      .setDescription('Replace all loot at a location with a manual list')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post to replace')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addStringOption(option => option.setName('items')
        .setDescription('One line each: chest number | item name | kind | quantity')
        .setMaxLength(1500)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('clear-chest')
      .setDescription('Remove every item from one chest')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post to update')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true))
      .addIntegerOption(option => option.setName('chest')
        .setDescription('Chest number, starting at 1')
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('remove-location')
      .setDescription('Delete all chest settings for a Forum post')
      .addChannelOption(option => option.setName('location')
        .setDescription('Pick the Forum post to remove')
        .addChannelTypes(ChannelType.PublicThread)
        .setRequired(true)))
    .addSubcommand(subcommand => subcommand.setName('table-list')
      .setDescription('Show the items in the Common, Rare, and Epic guided tables'))
    .addSubcommand(subcommand => subcommand.setName('table-add')
      .setDescription('Add an item to a guided rarity table')
      .addStringOption(option => option.setName('rarity')
        .setDescription('Choose the table to add to')
        .addChoices(...rarityChoices)
        .setRequired(true))
      .addStringOption(option => option.setName('item')
        .setDescription('Item name')
        .setMaxLength(80)
        .setRequired(true))
      .addStringOption(option => option.setName('kind')
        .setDescription('Choose the item type (defaults to Other item)')
        .addChoices(...itemKinds)))
    .addSubcommand(subcommand => subcommand.setName('table-remove')
      .setDescription('Remove an item from a guided rarity table')
      .addStringOption(option => option.setName('rarity')
        .setDescription('Choose the table to remove from')
        .addChoices(...rarityChoices)
        .setRequired(true))
      .addStringOption(option => option.setName('item')
        .setDescription('Enter the exact item name')
        .setMaxLength(80)
        .setRequired(true))),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    }

    const action = interaction.options.getSubcommand();
    const loot = await loadLoot(client, interaction.guildId);
    loot.posts ||= {};
    loot.tables ||= {};

    if (action === 'help') {
      return interaction.reply({
        content: [
          '🏴‍☠️ **Loot Admin Quick Guide**',
          '',
          '**Easy setup:** run `/lootadmin setup`, choose a Forum post and chest count, then run `/lootadmin add-item` once per item stack.',
          '**Quick random setup:** fill the Common, Rare, or Epic table with `/lootadmin table-add`, then use `/lootadmin guided-setup`.',
          '**Review:** `/lootadmin list` shows locations and contents; `/lootadmin table-list` shows guided tables.',
          '**Edit later:** use `/lootadmin add-item`, `remove-item`, `set-count`, or `clear-chest`.',
          '**Replace everything at a location:** `/lootadmin replace-list` overwrites all chest contents there.',
          '',
          'For a manual list, use one line per stack: `chest number | item name | kind | quantity`.',
          'Example: `1 | Wado Ichimonji | weapon | 1` or `2 | Berries | berry | 1000000`.',
          'Kinds: berry, weapon, devil_fruit, item. A Berry quantity is the Berry amount.'
        ].join('\n'),
        ephemeral: true
      });
    }

    if (action === 'list') {
      const list = postSummary(loot.posts);
      return interaction.reply({
        content: '🗺️ **Configured Forum Post Chests**\n' + (list || 'No Forum posts have chest settings yet. Use `/lootadmin setup` to make the first chests.'),
        ephemeral: true
      });
    }

    if (action === 'table-list') {
      return interaction.reply({ content: '🎲 **Guided Loot Tables**\n' + tableSummary(loot.tables), ephemeral: true });
    }

    if (action === 'table-add' || action === 'table-remove') {
      const rarity = interaction.options.getString('rarity');
      const itemName = cleanName(interaction.options.getString('item'));
      if (!rarity || !itemName) {
        return interaction.reply({ content: 'Choose a rarity and enter an item name.', ephemeral: true });
      }
      const kind = interaction.options.getString('kind') || 'item';
      loot.tables[rarity] ||= [];
      if (action === 'table-add') {
        if (!loot.tables[rarity].some(entry => entry.name.toLowerCase() === itemName.toLowerCase())) {
          loot.tables[rarity].push({ name: itemName, kind });
        }
      } else {
        loot.tables[rarity] = loot.tables[rarity].filter(entry => entry.name.toLowerCase() !== itemName.toLowerCase());
      }
      await saveConfig(client, 'loot', interaction.guildId, loot);
      return interaction.reply({
        content: action === 'table-add'
          ? 'Added **' + itemName + '** to the ' + rarity + ' guided table. Use `/lootadmin table-list` to review it.'
          : 'Removed **' + itemName + '** from the ' + rarity + ' guided table.',
        ephemeral: true
      });
    }

    const location = selectedForumPost(interaction);
    if (!location || !await isForumPost(location)) {
      return interaction.reply({ content: 'Choose a post inside a Forum channel in the location option.', ephemeral: true });
    }
    const stored = loot.posts[location.id];
    const chestCount = interaction.options.getInteger('chests');
    const chestNumber = interaction.options.getInteger('chest');
    const itemName = cleanName(interaction.options.getString('item'));
    const kind = interaction.options.getString('kind') || 'item';
    const quantity = interaction.options.getInteger('quantity') || 1;

    if (action === 'setup') {
      if (stored) {
        return interaction.reply({ content: 'This post already has chests. Use `/lootadmin set-count` or edit its contents.', ephemeral: true });
      }
      loot.posts[location.id] = {
        name: postName(location),
        parentId: location.parentId,
        chests: Array.from({ length: chestCount }, makeChest),
        updatedAt: Date.now()
      };
      await saveConfig(client, 'loot', interaction.guildId, loot);
      return interaction.reply({
        content: '📦 Created **' + chestCount + '** empty chest(s) in **' + postName(location) + '**. Next, use `/lootadmin add-item` to fill them.',
        ephemeral: true
      });
    }

    if (action === 'guided-setup') {
      if (stored) {
        return interaction.reply({ content: 'This post already has chests. Use `/lootadmin set-count` or edit its contents.', ephemeral: true });
      }
      const rarity = interaction.options.getString('rarity');
      const table = loot.tables[rarity] || [];
      if (!table.length) {
        return interaction.reply({ content: 'The ' + rarity + ' table is empty. Add items with `/lootadmin table-add`, then try again.', ephemeral: true });
      }
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
      return interaction.reply({
        content: '🎲 Created **' + chestCount + '** chest(s) in **' + postName(location) + '** using the ' + rarity + ' table.',
        ephemeral: true
      });
    }

    if (!stored) {
      return interaction.reply({ content: 'This post has no chest setup yet. Start with `/lootadmin setup` or `/lootadmin guided-setup`.', ephemeral: true });
    }

    if (action === 'remove-location') {
      delete loot.posts[location.id];
    } else if (action === 'set-count') {
      if (chestCount < stored.chests.length && stored.chests.slice(chestCount).some(chest => chest.items?.some(item => item.quantity > 0))) {
        return interaction.reply({ content: 'The extra chests still contain loot. Remove or clear those items before lowering the count.', ephemeral: true });
      }
      stored.chests = stored.chests.slice(0, chestCount);
      while (stored.chests.length < chestCount) stored.chests.push(makeChest());
      stored.updatedAt = Date.now();
    } else if (action === 'add-item') {
      const chest = getChest(stored, chestNumber);
      if (!chest) {
        return interaction.reply({ content: 'That chest number does not exist here. Use `/lootadmin list` to see the current chest count.', ephemeral: true });
      }
      const activeStacks = stored.chests.reduce((sum, entry) => sum + (entry.items || []).filter(item => item.quantity > 0).length, 0);
      if (activeStacks >= 25) {
        return interaction.reply({ content: 'This location already has 25 item stacks. Use `/lootadmin replace-list` to reorganize them.', ephemeral: true });
      }
      chest.items.push({ id: randomUUID(), name: itemName, kind, quantity });
      stored.updatedAt = Date.now();
    } else if (action === 'remove-item') {
      const chest = getChest(stored, chestNumber);
      if (!chest) {
        return interaction.reply({ content: 'That chest number does not exist here. Use `/lootadmin list` to see the current chest count.', ephemeral: true });
      }
      const itemIndex = chest.items.findIndex(item => item.name.toLowerCase() === itemName.toLowerCase());
      if (itemIndex < 0) {
        return interaction.reply({ content: 'That exact item name is not in this chest.', ephemeral: true });
      }
      chest.items.splice(itemIndex, 1);
      stored.updatedAt = Date.now();
    } else if (action === 'clear-chest') {
      const chest = getChest(stored, chestNumber);
      if (!chest) {
        return interaction.reply({ content: 'That chest number does not exist here. Use `/lootadmin list` to see the current chest count.', ephemeral: true });
      }
      chest.items = [];
      stored.updatedAt = Date.now();
    } else if (action === 'replace-list') {
      try {
        const itemsByChest = parseManualList(interaction.options.getString('items'), stored);
        for (const chest of stored.chests) chest.items = itemsByChest.get(chest.id) || [];
      } catch (error) {
        return interaction.reply({ content: error.message, ephemeral: true });
      }
      stored.updatedAt = Date.now();
    }

    await saveConfig(client, 'loot', interaction.guildId, loot);
    return interaction.reply({
      content: action === 'remove-location'
        ? 'Removed all chest settings for **' + postName(location) + '**.'
        : action === 'clear-chest'
          ? 'Cleared every item from Chest ' + chestNumber + ' at **' + postName(location) + '**.'
          : action === 'set-count'
            ? 'Updated **' + postName(location) + '** to **' + chestCount + '** chest(s).'
            : action === 'replace-list'
              ? 'Replaced all chest contents at **' + postName(location) + '**.'
              : 'Updated loot for **' + postName(location) + '**. Use `/lootadmin list` to review it.',
      ephemeral: true
    });
  }
};
