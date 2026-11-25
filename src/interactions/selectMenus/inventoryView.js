import { getEconomyData } from '../../utils/economy.js';
import { buildInventoryGui } from '../../services/inventoryGui.js';

export default {
  name: 'inventory_view',

  async execute(interaction, client, [viewerId, targetId]) {
    if (!viewerId || !targetId || interaction.user.id !== viewerId) {
      return interaction.reply({ content: 'This inventory menu belongs to another player.', ephemeral: true });
    }
    const user = await client.users.fetch(targetId).catch(() => null);
    if (!user) return interaction.update({ content: 'That player is no longer available.', embeds: [], components: [] });
    const account = await getEconomyData(client, interaction.guildId, targetId);
    const filter = interaction.values?.[0] || 'all';
    return interaction.update(buildInventoryGui({ user, account, viewerId, targetId, filter }));
  }
};
