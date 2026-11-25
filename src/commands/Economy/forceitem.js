import { SlashCommandBuilder } from 'discord.js';
import { isStaff } from '../../services/berryRpg.js';
import { addInventoryCount } from '../../services/berryInventory.js';
import { getEconomyData, setEconomyData, formatCurrency } from '../../utils/economy.js';

function itemKey(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return 'admin_' + (slug || 'custom_item');
}

export default {
  data: new SlashCommandBuilder()
    .setName('forceitem')
    .setDescription('Give a custom item to a member (Admin role required).')
    .addUserOption(option => option.setName('user').setDescription('Member receiving the item').setRequired(true))
    .addStringOption(option => option.setName('name').setDescription('Item name').setMinLength(1).setMaxLength(80).setRequired(true))
    .addIntegerOption(option => option.setName('quantity').setDescription('How many items to add').setMinValue(1).setMaxValue(1000000000).setRequired(true))
    .addIntegerOption(option => option.setName('worth').setDescription('Worth of each item in Berries').setMinValue(0).setMaxValue(2147483647).setRequired(true)),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    const user = interaction.options.getUser('user');
    if (user.bot) return interaction.reply({ content: 'Choose a human member.', ephemeral: true });
    const name = interaction.options.getString('name').trim();
    if (!name) return interaction.reply({ content: 'Enter an item name.', ephemeral: true });
    const quantity = interaction.options.getInteger('quantity');
    const worth = interaction.options.getInteger('worth');
    const account = await getEconomyData(client, interaction.guildId, user.id);
    const key = itemKey(name);
    addInventoryCount(account, key, quantity, name, { kind: 'item', source: 'staff', worth });
    if (!(await setEconomyData(client, interaction.guildId, user.id, account))) {
      return interaction.reply({ content: 'I could not save the item. Please try again.', ephemeral: true });
    }
    const totalWorth = worth * quantity;
    const worthSummary = 'Worth: ' + formatCurrency(worth) + ' each' + (Number.isSafeInteger(totalWorth) ? ' (' + formatCurrency(totalWorth) + ' total).' : '.');
    return interaction.reply({
      content: '🏴‍☠️ Added **' + quantity + ' × ' + name + '** to ' + user.toString() + '’s inventory. ' + worthSummary,
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
};
