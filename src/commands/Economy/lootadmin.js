import { SlashCommandBuilder } from 'discord.js';
import { cleanName, isStaff, loadLoot, saveConfig } from '../../services/berryRpg.js';

const rarityChoices = [
  { name: 'Common', value: 'common' },
  { name: 'Rare', value: 'rare' },
  { name: 'Epic', value: 'epic' }
];

export default {
  data: new SlashCommandBuilder()
    .setName('lootadmin')
    .setDescription('Configure chest locations and loot tables (staff only).')
    .addStringOption(option => option.setName('action').setDescription('What to change').setRequired(true)
      .addChoices({ name: 'Set chest rarity at a location', value: 'location' }, { name: 'Add loot item', value: 'add' }, { name: 'Remove loot item', value: 'remove' }))
    .addStringOption(option => option.setName('location').setDescription('Island or place name').setMaxLength(80))
    .addStringOption(option => option.setName('rarity').setDescription('Chest rarity or item rarity').addChoices(...rarityChoices))
    .addStringOption(option => option.setName('item').setDescription('Loot item name').setMaxLength(80)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can change loot settings.', ephemeral: true });
    const action = interaction.options.getString('action');
    const loot = await loadLoot(client, interaction.guildId);
    const location = cleanName(interaction.options.getString('location'));
    const rarity = interaction.options.getString('rarity');
    const item = cleanName(interaction.options.getString('item'));

    if (action === 'location') {
      if (!location || !rarity) return interaction.reply({ content: 'Set both a location and its chest rarity.', ephemeral: true });
      loot.locations[location.toLowerCase()] = rarity;
      await saveConfig(client, 'loot', interaction.guildId, loot);
      return interaction.reply({ content: '🍰 **' + location + '** now has **' + rarity + '** chests.', ephemeral: true });
    }

    if (!item || !rarity) return interaction.reply({ content: 'Set an item name and its rarity.', ephemeral: true });
    if (action === 'add') {
      if (!loot.tables[rarity].some(entry => entry.name.toLowerCase() === item.toLowerCase())) loot.tables[rarity].push({ name: item });
    } else {
      const before = loot.tables[rarity].length;
      loot.tables[rarity] = loot.tables[rarity].filter(entry => entry.name.toLowerCase() !== item.toLowerCase());
      if (loot.tables[rarity].length === before) return interaction.reply({ content: 'That item is not in the ' + rarity + ' loot table.', ephemeral: true });
    }

    await saveConfig(client, 'loot', interaction.guildId, loot);
    return interaction.reply({ content: action === 'add' ? 'Added **' + item + '** to the ' + rarity + ' loot table.' : 'Removed **' + item + '** from the ' + rarity + ' loot table.', ephemeral: true });
  }
};
