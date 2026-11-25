import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { loadLoot, cleanName } from '../../services/berryRpg.js';

const bagKey = (guildId, userId) => 'berry:loot-bag:' + guildId + ':' + userId;
const rarityList = rarity => rarity === 'common' ? ['common'] : rarity === 'rare' ? ['common', 'rare'] : ['common', 'rare', 'epic'];

export default {
  data: new SlashCommandBuilder()
    .setName('checkloot')
    .setDescription('Search a place for chests, open one, or see your found items.')
    .addStringOption(option => option.setName('action').setDescription('What to do').setRequired(true)
      .addChoices({ name: 'Search for chests', value: 'search' }, { name: 'Open a chest', value: 'open' }, { name: 'View item inventory', value: 'inventory' }))
    .addStringOption(option => option.setName('location').setDescription('Island or place to search').setMaxLength(80))
    .addIntegerOption(option => option.setName('chest').setDescription('Chest number in your stash (starts at 1)').setMinValue(1).setMaxValue(5)),

  async execute(interaction, config, client) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const action = interaction.options.getString('action');
    if (action === 'inventory') {
      const account = await getEconomyData(client, guildId, userId);
      const found = Object.entries(account.inventory || {}).filter(([name, count]) => name.startsWith('loot_') && count > 0);
      const text = found.length ? found.map(([name, count]) => '• ' + name.slice(5).replaceAll('_', ' ') + ' × ' + count).join('\n') : 'Your loot inventory is empty.';
      return interaction.reply({ content: '🎒 **Loot inventory**\n' + text, ephemeral: true });
    }

    const bag = await client.db.get(bagKey(guildId, userId), []);
    if (action === 'search') {
      const location = cleanName(interaction.options.getString('location'));
      if (!location) return interaction.reply({ content: 'Enter a location to search.', ephemeral: true });
      const loot = await loadLoot(client, guildId);
      const chestRarity = loot.locations[location.toLowerCase()];
      if (!chestRarity) return interaction.reply({ content: 'There is no chest location configured for **' + location + '** yet.', ephemeral: true });
      const count = Math.random() < 0.2 ? 5 : 1;
      for (let index = 0; index < count; index++) bag.push({ rarity: chestRarity, location, foundAt: Date.now() });
      await client.db.set(bagKey(guildId, userId), bag);
      return interaction.reply({ content: '🔎 You found **' + count + (count === 1 ? ' ' + chestRarity + ' chest' : ' ' + chestRarity + ' chests') + '** at **' + location + '**. Use /checkloot action:open chest:<number> to open one.', ephemeral: true });
    }

    const chestIndex = (interaction.options.getInteger('chest') || 1) - 1;
    if (!bag[chestIndex]) return interaction.reply({ content: 'You do not have that chest. Search a configured location first.', ephemeral: true });
    const chest = bag[chestIndex];
    bag.splice(chestIndex, 1);
    await client.db.set(bagKey(guildId, userId), bag);

    const loot = await loadLoot(client, guildId);
    const eligible = rarityList(chest.rarity).flatMap(rarity => loot.tables[rarity] || []);
    if (Math.random() < 0.12 || eligible.length === 0) {
      return interaction.reply({ content: '🕳️ The ' + chest.rarity + ' chest was empty. You still have ' + bag.length + ' chest(s).', ephemeral: true });
    }
    const item = eligible[Math.floor(Math.random() * eligible.length)];
    const account = await getEconomyData(client, guildId, userId);
    const inventoryKey = 'loot_' + item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    account.inventory[inventoryKey] = (account.inventory[inventoryKey] || 0) + 1;
    await setEconomyData(client, guildId, userId, account);
    return interaction.reply({ content: '🎁 Your **' + chest.rarity + '** chest from **' + chest.location + '** contained **' + item.name + '**! You have ' + bag.length + ' chest(s) left.', ephemeral: true });
  }
};
