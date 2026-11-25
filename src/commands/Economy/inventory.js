import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, setEconomyData, formatCurrency } from '../../utils/economy.js';
import { inventoryEntries, inventoryToken, findInventoryEntry, removeInventoryCount, addInventoryCount } from '../../services/berryInventory.js';
import { isStaff } from '../../services/berryRpg.js';
import { buildInventoryGui } from '../../services/inventoryGui.js';

export default {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Manage the items your pirate carries.')
    .addSubcommand(sub => sub.setName('view').setDescription('View your private pirate inventory.')
      .addUserOption(option => option.setName('user').setDescription('Staff can choose whose inventory to view.')))
    .addSubcommand(sub => sub.setName('use').setDescription('Consume or remove an item from your inventory.')
      .addStringOption(option => option.setName('item').setDescription('Item to use').setRequired(true).setAutocomplete(true))
      .addIntegerOption(option => option.setName('amount').setDescription('How many to use').setMinValue(1).setMaxValue(99)))
    .addSubcommand(sub => sub.setName('equip').setDescription('Take one item out of your inventory and hold it.')
      .addStringOption(option => option.setName('item').setDescription('Item to hold in your character’s hand').setRequired(true).setAutocomplete(true)))
    .addSubcommand(sub => sub.setName('stow').setDescription('Put your held item back into your inventory.'))
    .addSubcommand(sub => sub.setName('give').setDescription('Give an item or Berries to another member.')
      .addUserOption(option => option.setName('user').setDescription('Member receiving the gift').setRequired(true))
      .addStringOption(option => option.setName('item').setDescription('Item to give').setAutocomplete(true))
      .addIntegerOption(option => option.setName('amount').setDescription('How many items to give').setMinValue(1).setMaxValue(99))
      .addIntegerOption(option => option.setName('berries').setDescription('Berries to give instead of an item').setMinValue(1).setMaxValue(2147483647))),

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
      const selectedUser = interaction.options.getUser('user');
      if (selectedUser && selectedUser.id !== interaction.user.id && !isStaff(interaction)) {
        return interaction.reply({ content: 'You can view only your own inventory. Staff can view another member’s inventory.', ephemeral: true });
      }
      const user = selectedUser || interaction.user;
      const account = await getEconomyData(client, guildId, user.id);
      const response = buildInventoryGui({
        user,
        account,
        viewerId: interaction.user.id,
        targetId: user.id,
        filter: 'all'
      });
      return interaction.reply({ ...response, ephemeral: true });
    }

    const account = await getEconomyData(client, guildId, interaction.user.id);
    if (action === 'stow') {
      const heldItem = account.heldItem;
      if (!heldItem?.key || !heldItem?.name) {
        return interaction.reply({ content: 'You are not holding an item right now.', ephemeral: true });
      }
      addInventoryCount(account, heldItem.key, 1, heldItem.name, heldItem.metadata || {});
      account.heldItem = null;
      if (!(await setEconomyData(client, guildId, interaction.user.id, account))) {
        return interaction.reply({ content: 'I could not save your inventory change. Please try again.', ephemeral: true });
      }
      return interaction.reply({ content: '🎒 Stowed **' + heldItem.name + '** back in your inventory.', ephemeral: true });
    }

    if (action === 'give') {
      const recipient = interaction.options.getUser('user');
      if (recipient.bot || recipient.id === interaction.user.id) {
        return interaction.reply({ content: 'Choose another human member to receive the gift.', ephemeral: true });
      }

      const berries = interaction.options.getInteger('berries');
      const itemToken = interaction.options.getString('item');
      const amount = interaction.options.getInteger('amount') || 1;
      if ((berries && itemToken) || (!berries && !itemToken)) {
        return interaction.reply({ content: 'Choose either an item or a Berry amount to give.', ephemeral: true });
      }
      if (berries && interaction.options.getInteger('amount')) {
        return interaction.reply({ content: 'The item amount option is only used when giving an item.', ephemeral: true });
      }

      if (berries) {
        if ((account.wallet || 0) < berries) {
          return interaction.reply({ content: 'You only have ' + formatCurrency(account.wallet || 0) + '.', ephemeral: true });
        }
        const recipientAccount = await getEconomyData(client, guildId, recipient.id);
        if (!Number.isSafeInteger((recipientAccount.wallet || 0) + berries)) {
          return interaction.reply({ content: 'That transfer would exceed the recipient’s safe Berry balance limit.', ephemeral: true });
        }
        account.wallet -= berries;
        recipientAccount.wallet = (recipientAccount.wallet || 0) + berries;
        const recipientSaved = await setEconomyData(client, guildId, recipient.id, recipientAccount);
        if (!recipientSaved) return interaction.reply({ content: 'I could not save the recipient’s Berry balance. Nothing was sent.', ephemeral: true });
        const senderSaved = await setEconomyData(client, guildId, interaction.user.id, account);
        if (!senderSaved) {
          recipientAccount.wallet -= berries;
          await setEconomyData(client, guildId, recipient.id, recipientAccount);
          return interaction.reply({ content: 'The Berry transfer could not be saved. Please try again.', ephemeral: true });
        }
        return interaction.reply({ content: 'Sent **' + formatCurrency(berries) + '** to ' + recipient.toString() + '.', ephemeral: true });
      }

      const item = findInventoryEntry(account, itemToken);
      if (!item) return interaction.reply({ content: 'That item is no longer in your inventory. Select it again from the item list.', ephemeral: true });
      const recipientAccount = await getEconomyData(client, guildId, recipient.id);
      if (!removeInventoryCount(account, item.key, amount)) {
        return interaction.reply({ content: 'You do not have that many **' + item.name + '**.', ephemeral: true });
      }
      addInventoryCount(recipientAccount, item.key, amount, item.name, item.metadata);
      const recipientSaved = await setEconomyData(client, guildId, recipient.id, recipientAccount);
      if (!recipientSaved) return interaction.reply({ content: 'I could not save the recipient’s inventory. Nothing was transferred.', ephemeral: true });
      const senderSaved = await setEconomyData(client, guildId, interaction.user.id, account);
      if (!senderSaved) {
        removeInventoryCount(recipientAccount, item.key, amount);
        await setEconomyData(client, guildId, recipient.id, recipientAccount);
        return interaction.reply({ content: 'The item transfer could not be saved. Please try again.', ephemeral: true });
      }
      return interaction.reply({ content: '🎁 Gave **' + amount + ' × ' + item.name + '** to ' + recipient.toString() + '.', ephemeral: true });
    }

    const item = findInventoryEntry(account, interaction.options.getString('item'));
    if (!item) return interaction.reply({ content: 'That item is no longer in your inventory. Select it again from the item list.', ephemeral: true });

    if (action === 'equip') {
      if (account.heldItem?.key) {
        return interaction.reply({ content: 'You are already holding **' + account.heldItem.name + '**. Use /inventory stow before equipping another item.', ephemeral: true });
      }
      const itemMetadata = { ...(account.inventoryMeta?.[item.key] || {}) };
      if (!removeInventoryCount(account, item.key, 1)) {
        return interaction.reply({ content: 'You do not have **' + item.name + '** anymore.', ephemeral: true });
      }
      account.heldItem = { key: item.key, name: item.name, metadata: itemMetadata };
      if (!(await setEconomyData(client, guildId, interaction.user.id, account))) {
        return interaction.reply({ content: 'I could not save your held item. Please try again.', ephemeral: true });
      }
      return interaction.reply({ content: '🗡️ **' + item.name + '** is now in your character’s hand. Use /inventory stow to put it away.', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount') || 1;
    if (!removeInventoryCount(account, item.key, amount)) {
      return interaction.reply({ content: 'You do not have that many **' + item.name + '**.', ephemeral: true });
    }
    if (!(await setEconomyData(client, guildId, interaction.user.id, account))) {
      return interaction.reply({ content: 'I could not save your inventory change. Please try again.', ephemeral: true });
    }
    return interaction.reply({ content: '🏴‍☠️ Used/removed **' + amount + ' × ' + item.name + '** from your inventory.', ephemeral: true });
  }
};
