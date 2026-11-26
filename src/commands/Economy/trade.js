import { randomUUID } from 'node:crypto';
import { SlashCommandBuilder } from 'discord.js';
import { formatCurrency, getEconomyData, setEconomyData } from '../../utils/economy.js';
import { addInventoryCount, findInventoryEntry, inventoryEntries, removeInventoryCount } from '../../services/berryInventory.js';

const offersKey = guildId => 'berry:trade-offers:' + guildId;
const loadOffers = async (client, guildId) => client.db.get(offersKey(guildId), []);
const saveOffers = async (client, guildId, offers) => client.db.set(offersKey(guildId), offers);
const isActive = offer => offer.status === 'pending' && offer.expiresAt > Date.now();

export default {
  data: new SlashCommandBuilder()
    .setName('trade')
    .setDescription('Offer Berries for an item, or send Berries as a gift.')
    .addSubcommand(sub => sub.setName('offer').setDescription('Offer Berries to a member for an item or as a gift.')
      .addUserOption(option => option.setName('user').setDescription('Member receiving your offer').setRequired(true))
      .addIntegerOption(option => option.setName('berries').setDescription('Berries you will pay if accepted').setMinValue(1).setMaxValue(2147483647).setRequired(true))
      .addStringOption(option => option.setName('item').setDescription('Item you want in exchange (leave blank for no item)').setMaxLength(100))
      .addIntegerOption(option => option.setName('item_amount').setDescription('How many of that item (defaults to 1)').setMinValue(1).setMaxValue(99)))
    .addSubcommand(sub => sub.setName('accept').setDescription('Accept a pending offer made to you.')
      .addStringOption(option => option.setName('offer_id').setDescription('Offer ID shown in the offer message').setRequired(true).setMinLength(8).setMaxLength(36)))
    .addSubcommand(sub => sub.setName('decline').setDescription('Decline a pending offer made to you.')
      .addStringOption(option => option.setName('offer_id').setDescription('Offer ID shown in the offer message').setRequired(true).setMinLength(8).setMaxLength(36))),

  async execute(interaction, config, client) {
    const guildId = interaction.guildId;
    const action = interaction.options.getSubcommand();
    const offers = await loadOffers(client, guildId);

    if (action === 'offer') {
      const recipient = interaction.options.getUser('user');
      const berries = interaction.options.getInteger('berries');
      const itemName = interaction.options.getString('item')?.trim() || null;
      const itemAmount = interaction.options.getInteger('item_amount') || 1;
      if (recipient.bot || recipient.id === interaction.user.id) {
        return interaction.reply({ content: 'Choose another human member for the offer.', ephemeral: true });
      }
      if (!itemName && interaction.options.getInteger('item_amount')) {
        return interaction.reply({ content: 'Choose an item or leave item amount blank.', ephemeral: true });
      }
      const id = randomUUID();
      const offer = {
        id,
        guildId,
        fromId: interaction.user.id,
        fromName: interaction.user.username,
        toId: recipient.id,
        toName: recipient.username,
        berries,
        itemName,
        itemAmount: itemName ? itemAmount : 0,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
      const activeOffers = offers.filter(isActive);
      activeOffers.push(offer);
      await saveOffers(client, guildId, activeOffers);
      const itemText = itemName ? ' for **' + itemAmount + ' × ' + itemName + '**' : ' as a Berry gift';
      return interaction.reply({ content: '📜 Trade offer **' + id + '**: ' + recipient.toString() + ' can accept ' + formatCurrency(berries) + itemText + ' with `/trade accept offer_id:' + id + '` or decline it. It expires in 24 hours.', ephemeral: false });
    }

    const id = interaction.options.getString('offer_id');
    const offer = offers.find(entry => entry.id === id && isActive(entry));
    if (!offer) return interaction.reply({ content: 'That offer is missing, already handled, or expired.', ephemeral: true });
    if (offer.toId !== interaction.user.id) return interaction.reply({ content: 'Only the member who received this offer can accept or decline it.', ephemeral: true });

    if (action === 'decline') {
      offer.status = 'declined';
      offer.resolvedAt = Date.now();
      await saveOffers(client, guildId, offers);
      return interaction.reply({ content: 'Offer **' + id + '** declined.', ephemeral: true });
    }

    const payer = await getEconomyData(client, guildId, offer.fromId);
    const recipient = await getEconomyData(client, guildId, offer.toId);
    if ((payer.wallet || 0) < offer.berries) {
      return interaction.reply({ content: 'The offer maker no longer has enough Berries. The offer was not completed.', ephemeral: true });
    }

    let requestedItem = null;
    if (offer.itemName) {
      requestedItem = inventoryEntries(recipient).find(item =>
        item.name.toLowerCase() === offer.itemName.toLowerCase()
      );
      if (!requestedItem || requestedItem.count < offer.itemAmount) {
        return interaction.reply({ content: 'You no longer have the requested item amount. The offer was not completed.', ephemeral: true });
      }
      removeInventoryCount(recipient, requestedItem.key, offer.itemAmount);
      addInventoryCount(payer, requestedItem.key, offer.itemAmount, requestedItem.name, requestedItem.metadata);
    }

    payer.wallet -= offer.berries;
    recipient.wallet = (recipient.wallet || 0) + offer.berries;
    const payerSaved = await setEconomyData(client, guildId, offer.fromId, payer);
    if (!payerSaved) return interaction.reply({ content: 'The trade could not be saved. Please try again.', ephemeral: true });
    const recipientSaved = await setEconomyData(client, guildId, offer.toId, recipient);
    if (!recipientSaved) {
      payer.wallet += offer.berries;
      if (requestedItem) {
        removeInventoryCount(payer, requestedItem.key, offer.itemAmount);
        addInventoryCount(recipient, requestedItem.key, offer.itemAmount, requestedItem.name, requestedItem.metadata);
      }
      await setEconomyData(client, guildId, offer.fromId, payer);
      return interaction.reply({ content: 'The trade could not be saved. Please try again.', ephemeral: true });
    }

    offer.status = 'completed';
    offer.resolvedAt = Date.now();
    await saveOffers(client, guildId, offers);
    const exchange = requestedItem ? ' for **' + offer.itemAmount + ' × ' + requestedItem.name + '**' : '';
    return interaction.reply({ content: '🤝 Trade completed: ' + offer.fromName + ' paid ' + formatCurrency(offer.berries) + exchange + '.', ephemeral: false });
  }
};
