import { getEconomyData, setEconomyData } from '../../utils/economy.js';
import { addInventoryCount } from '../../services/berryInventory.js';
import { buildLootPanel, loadLootPost, saveLootPostConfig } from '../../services/berryLootPosts.js';

function inventoryKeyFor(item) {
  const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return 'loot_' + (slug || item.id);
}

export default {
  name: 'loot_take',

  async execute(interaction, client, [threadId]) {
    if (!interaction.guildId || !threadId || !interaction.values?.[0]) {
      return interaction.reply({ content: 'This loot selection is no longer available.', ephemeral: true });
    }

    const [chestId, itemId] = interaction.values[0].split('~');
    if (!chestId || !itemId) {
      return interaction.reply({ content: 'That loot selection is invalid.', ephemeral: true });
    }

    const lockKey = 'cache:berry-loot-claim:' + interaction.guildId + ':' + threadId;
    const locked = await client.db.setIfAbsent?.(lockKey, interaction.user.id, 20);
    if (locked !== true) {
      return interaction.reply({ content: locked == null
        ? 'The shared loot store is unavailable, so no item was taken. Please try again later.'
        : 'Someone is already taking loot from this post. Try again in a moment.', ephemeral: true });
    }

    try {
      const { loot, post } = await loadLootPost(client, interaction.guildId, threadId);
      if (!post) {
        return interaction.update({ content: 'This Forum post has no chest setup now.', components: [] });
      }

      const chest = (post.chests || []).find(entry => entry.id === chestId);
      const item = chest?.items?.find(entry => entry.id === itemId && entry.quantity > 0);
      if (!chest || !item) {
        const panel = buildLootPanel(threadId, post);
        return interaction.update({ ...panel, content: 'That item has already been taken.\n' + panel.content });
      }

      const account = await getEconomyData(client, interaction.guildId, interaction.user.id);
      const originalAccount = structuredClone(account);
      if (item.kind === 'berry') {
        const nextBalance = (account.wallet || 0) + item.quantity;
        if (!Number.isSafeInteger(nextBalance)) {
          return interaction.update({ content: 'Your Berry balance is too high to receive this stack. Contact staff to adjust it.', components: [] });
        }
        account.wallet = nextBalance;
      } else {
        addInventoryCount(account, inventoryKeyFor(item), 1, item.name);
      }

      if (!(await setEconomyData(client, interaction.guildId, interaction.user.id, account))) {
        return interaction.update({ content: 'I could not save your reward, so the chest was left unchanged. Please try again.', components: [] });
      }

      if (item.kind === 'berry') {
        chest.items = chest.items.filter(entry => entry.id !== item.id);
      } else {
        item.quantity -= 1;
        if (item.quantity <= 0) chest.items = chest.items.filter(entry => entry.id !== item.id);
      }
      post.chests = post.chests.filter(entry => entry.items?.some(lootItem => lootItem.quantity > 0));
      post.updatedAt = Date.now();

      if (await saveLootPostConfig(client, interaction.guildId, loot) === false) {
        await setEconomyData(client, interaction.guildId, interaction.user.id, originalAccount);
        return interaction.update({ content: 'I could not update the chest, so the item was returned. Please try again.', components: [] });
      }

      const updatedPost = loot.posts[threadId];
      const rewardText = item.kind === 'berry'
        ? '<:Berry:1573798988988031087> ' + item.quantity.toLocaleString() + ' Berries'
        : '**' + item.name + '**';
      const panel = buildLootPanel(threadId, updatedPost);
      return interaction.update({
        ...panel,
        content: '🎁 You took ' + rewardText + ' from **' + updatedPost.name + '**.\n' + panel.content
      });
    } finally {
      await client.db.delete(lockKey).catch(() => {});
    }
  }
};
