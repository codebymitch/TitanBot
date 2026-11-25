import { SlashCommandBuilder } from 'discord.js';
import { getEconomyData, formatCurrency, setEconomyData } from '../../utils/economy.js';
import { inventoryEntries } from '../../services/berryInventory.js';
import { isStaff } from '../../services/berryRpg.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Clear a member’s inventory or Berry wallet (Admin only).')
    .addSubcommand(sub => sub.setName('inventory').setDescription('Clear all carried and held items from a member.')
      .addUserOption(option => option.setName('user').setDescription('Member whose items will be cleared').setRequired(true)))
    .addSubcommand(sub => sub.setName('berries').setDescription('Set a member’s Berry wallet balance to zero.')
      .addUserOption(option => option.setName('user').setDescription('Member whose Berry wallet will be cleared').setRequired(true))),

  async execute(interaction, config, client) {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: 'This command requires the Admin role.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    if (!user || user.bot) {
      return interaction.reply({ content: 'Choose a human member of this server.', ephemeral: true });
    }

    const account = await getEconomyData(client, interaction.guildId, user.id);
    const action = interaction.options.getSubcommand();

    if (action === 'inventory') {
      const entries = inventoryEntries(account);
      const itemCount = entries.reduce((total, item) => total + item.count, 0);
      const heldItem = account.heldItem?.name || null;
      account.inventory = {};
      account.inventoryMeta = {};
      account.heldItem = null;

      if (!(await setEconomyData(client, interaction.guildId, user.id, account))) {
        return interaction.reply({ content: 'I could not save the inventory change. Nothing was cleared.', ephemeral: true });
      }

      const heldText = heldItem ? ' Their held item, **' + heldItem + '**, was cleared too.' : '';
      return interaction.reply({
        content: '🏴‍☠️ Cleared **' + itemCount + '** item(s) from **' + user.username + '**’s inventory.' + heldText,
        ephemeral: true,
      });
    }

    const clearedBerries = Number(account.wallet) || 0;
    account.wallet = 0;
    if (!(await setEconomyData(client, interaction.guildId, user.id, account))) {
      return interaction.reply({ content: 'I could not save the Berry balance change. Nothing was cleared.', ephemeral: true });
    }

    return interaction.reply({
      content: '<:Berry:1573798988988031087> Cleared **' + formatCurrency(clearedBerries) + '** from **' + user.username + '**’s Berry wallet.',
      ephemeral: true,
    });
  }
};
