import { SlashCommandBuilder } from 'discord.js';
import { formatCurrency } from '../../utils/economy.js';
import { adjustBerries, isStaff } from '../../services/berryRpg.js';
import {
  createBoat, formatShip, getBoats, priceBoat, saveBoats, SHIP_CLASSES, SHIP_QUALITIES,
} from '../../services/berryShips.js';

const classChoices = Object.entries(SHIP_CLASSES).map(([value, ship]) => ({ name: ship.label, value }));
const qualityChoices = Object.entries(SHIP_QUALITIES).map(([value, quality]) => ({ name: quality.label, value }));

export default {
  data: new SlashCommandBuilder()
    .setName('shipyard')
    .setDescription('Buy, manage, or review your ships.')
    .addStringOption(option => option.setName('action').setDescription('Shipyard action').setRequired(true)
      .addChoices(
        { name: 'Show ship catalog', value: 'catalog' },
        { name: 'Show my ships', value: 'boats' },
        { name: 'Buy a ship', value: 'buy' },
        { name: 'Grant a ship (staff)', value: 'grant' },
        { name: 'Rename a ship', value: 'rename' },
        { name: 'Remove a ship', value: 'delete' }
      ))
    .addStringOption(option => option.setName('ship_class').setDescription('Ship classification').addChoices(...classChoices))
    .addStringOption(option => option.setName('quality').setDescription('How well the ship sails').addChoices(...qualityChoices))
    .addStringOption(option => option.setName('name').setDescription('Your boat name or new name').setMaxLength(80))
    .addIntegerOption(option => option.setName('price').setDescription('Custom ship base price (200,000,000 Berries or more)').setMinValue(200000000).setMaxValue(2000000000))
    .addStringOption(option => option.setName('boat').setDescription('Choose one of your ships').setAutocomplete(true))
    .addUserOption(option => option.setName('user').setDescription('Member receiving the staff-granted ship')),

  async autocomplete(interaction, client) {
    const boats = await getBoats(client, interaction.guildId, interaction.user.id);
    const query = String(interaction.options.getFocused() || '').toLowerCase();
    return interaction.respond(boats.filter(boat => boat.name.toLowerCase().includes(query) || boat.id.startsWith(query)).slice(0, 25)
      .map(boat => ({ name: formatShip(boat).replaceAll('*', '').slice(0, 100), value: boat.id })));
  },

  async execute(interaction, config, client) {
    const action = interaction.options.getString('action');
    const guildId = interaction.guildId;
    const current = await getBoats(client, guildId, interaction.user.id);

    if (action === 'catalog') {
      const lines = Object.entries(SHIP_CLASSES).map(([shipClass, ship]) => {
        const examples = Object.entries(SHIP_QUALITIES).map(([quality, spec]) => {
          const base = shipClass === 'custom' ? ship.basePrice : ship.basePrice;
          return spec.label + ': ' + formatCurrency(Math.round(base * spec.priceMultiplier));
        }).join(' • ');
        return '**' + ship.label + '** — ' + examples;
      });
      return interaction.reply({ content: '⚓ **Shipyard Catalog**\n' + lines.join('\n') + '\n\nUse /shipyard action:buy to purchase and name a ship. Custom ships start at 200,000,000 Berries.', ephemeral: true });
    }

    if (action === 'boats') {
      return interaction.reply({ content: current.length ? '🚢 **Your ships**\n' + current.map(boat => '• ' + formatShip(boat)).join('\n') : 'You do not own a ship yet. Use /shipyard action:catalog to browse the shipyard.', ephemeral: true });
    }

    if (action === 'buy' || action === 'grant') {
      const shipClass = interaction.options.getString('ship_class');
      const quality = interaction.options.getString('quality');
      const name = String(interaction.options.getString('name') || '').trim();
      const recipient = action === 'grant' ? interaction.options.getUser('user') : interaction.user;
      if (action === 'grant' && !isStaff(interaction)) return interaction.reply({ content: 'Only server administrators or members with Manage Server can grant ships.', ephemeral: true });
      if (!shipClass || !quality || !name || !recipient) return interaction.reply({ content: 'Choose a ship class, quality, name, and (for staff grants) recipient.', ephemeral: true });
      if (recipient.bot) return interaction.reply({ content: 'Ships can only be assigned to people.', ephemeral: true });

      let price;
      try {
        price = priceBoat(shipClass, quality, interaction.options.getInteger('price'));
      } catch (error) {
        return interaction.reply({ content: error.message, ephemeral: true });
      }

      const recipientBoats = recipient.id === interaction.user.id ? current : await getBoats(client, guildId, recipient.id);
      if (recipientBoats.some(boat => boat.name.toLowerCase() === name.toLowerCase())) return interaction.reply({ content: 'You already have a ship with that name. Choose a different name.', ephemeral: true });
      if (action === 'buy') {
        try {
          await adjustBerries(client, guildId, interaction.user.id, -price);
        } catch (error) {
          return interaction.reply({ content: error.message || 'You do not have enough Berries for that ship.', ephemeral: true });
        }
      }

      const boat = createBoat({ name, shipClass, quality, price: action === 'buy' ? price : 0 });
      recipientBoats.push(boat);
      await saveBoats(client, guildId, recipient.id, recipientBoats);
      const costText = action === 'buy' ? ' for ' + formatCurrency(price) : ' (granted by staff)';
      return interaction.reply({ content: '⚓ ' + recipient.toString() + ' now owns ' + formatShip(boat) + costText + '.', ephemeral: true });
    }

    const boatId = interaction.options.getString('boat');
    const index = current.findIndex(boat => boat.id === boatId);
    if (index < 0) return interaction.reply({ content: 'Choose one of your ships from the boat option.', ephemeral: true });

    if (action === 'rename') {
      const name = String(interaction.options.getString('name') || '').trim();
      if (!name) return interaction.reply({ content: 'Enter the ship’s new name.', ephemeral: true });
      if (current.some((boat, boatIndex) => boatIndex !== index && boat.name.toLowerCase() === name.toLowerCase())) return interaction.reply({ content: 'You already have a ship with that name.', ephemeral: true });
      current[index].name = name.slice(0, 80);
      await saveBoats(client, guildId, interaction.user.id, current);
      return interaction.reply({ content: 'Renamed your ship to **' + current[index].name + '**.', ephemeral: true });
    }

    current.splice(index, 1);
    await saveBoats(client, guildId, interaction.user.id, current);
    return interaction.reply({ content: 'Removed that ship from your fleet.', ephemeral: true });
  }
};
