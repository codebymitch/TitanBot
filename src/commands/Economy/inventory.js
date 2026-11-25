import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { inventoryEntries, inventoryToken, findInventoryEntry, removeInventoryCount, addInventoryCount } from '../../services/berryInventory.js';
import { isStaff } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View, use, or give items in your pirate inventory.')
    .addSubcommand(sub => sub.setName('view').setDescription('Show items from shops, merchants, and chests.')
      .addUserOption(option => option.setName('user').setDescription('Inventory to view')))
    .addSubcommand(sub => sub.setName('use').setDescription('Consume or remove an item from your inventory.')
      .addStringOption(option => option.setName('item').setDescription('Item to use').setRequired(true).setAutocomplete(true))
      .addIntegerOption(option => option.setName('amount').setDescription('How many to use').setMinValue(1).setMaxValue(99)))
    .addSubcommand(sub => sub.setName('give').setDescription('Give an item to another member.')
      .addUserOption(option => option.setName('user').setDescription('Member receiving the item').setRequired(true))
      .addStringOption(option => option.setName('item').setDescription('Item to give').setRequired(true).setAutocomplete(true))
      .addIntegerOption(option => option.setName('amount').setDescription('How many to give').setMinValue(1).setMaxValue(99))),

  async autocomplete(interaction, client) {
    const account = await getEconomyData(client, interaction.guildId, interaction.user.id);
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const choices = inventoryEntries(account)
      .filter(item => item.name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(item => ({ name: (item.name + ' × ' + item.count).slice(0, 100), value: inventoryToken(item.key) }));
    return interaction.respond(choices);
  },

  async execute(interaction, config, client) {
    const action = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (action === 'view') {
      if (!isStaff(interaction)) return interaction.reply({ content: 'Viewing inventories requires the Admin staff role.', ephemeral: true });
      const user = interaction.options.getUser('user') || interaction.user;
      const account = await getEconomyData(client, guildId, user.id);
      const items = inventoryEntries(account);
      const body = items.length
        ? items.map(item => '• **' + item.name + '** × ' + item.count).join('\n')
        : 'Your inventory is empty.';
      return interaction.reply({ content: '🎒 **' + user.username + '’s inventory**\n' + body, ephemeral: true });
    }

    const account = await getEconomyData(client, guildId, interaction.user.id);
    const item = findInventoryEntry(account, interaction.options.getString('item'));
    if (!item) return interaction.reply({ content: 'That item is no longer in your inventory. Run /inventory view and try again.', ephemeral: true });
    const amount = interaction.options.getInteger('amount') || 1;

    if (action === 'use') {
      if (!removeInventoryCount(account, item.key, amount)) {
        return interaction.reply({ content: 'You do not have that many **' + item.name + '**.', ephemeral: true });
      }
      if (!(await setEconomyData(client, guildId, interaction.user.id, account))) {
        return interaction.reply({ content: 'I could not save your inventory change. Please try again.', ephemeral: true });
      }
      return interaction.reply({ content: '🏴‍☠️ Used/removed **' + amount + ' × ' + item.name + '** from your inventory.', ephemeral: true });
    }

    const recipient = interaction.options.getUser('user');
    if (recipient.bot || recipient.id === interaction.user.id) {
      return interaction.reply({ content: 'Choose another human member to receive the item.', ephemeral: true });
    }
    const recipientAccount = await getEconomyData(client, guildId, recipient.id);
    if (!removeInventoryCount(account, item.key, amount)) {
      return interaction.reply({ content: 'You do not have that many **' + item.name + '**.', ephemeral: true });
    }
    addInventoryCount(recipientAccount, item.key, amount, item.name);
    const recipientSaved = await setEconomyData(client, guildId, recipient.id, recipientAccount);
    if (!recipientSaved) return interaction.reply({ content: 'I could not save the recipient’s inventory. Nothing was transferred.', ephemeral: true });
    const senderSaved = await setEconomyData(client, guildId, interaction.user.id, account);
    if (!senderSaved) {
      removeInventoryCount(recipientAccount, item.key, amount);
      await setEconomyData(client, guildId, recipient.id, recipientAccount);
      return interaction.reply({ content: 'The transfer could not be saved. Please try again.', ephemeral: true });
    }
    return interaction.reply({ content: '🎁 Gave **' + amount + ' × ' + item.name + '** to ' + recipient.toString() + '.', ephemeral: true });
  }
};
