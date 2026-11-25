import { ActionRowBuilder, ChannelType, StringSelectMenuBuilder } from 'discord.js';
import { loadLoot } from './berryRpg.js';

export async function isForumPost(channel) {
  if (!channel?.isThread?.() || !channel.parentId) return false;
  const parent = channel.parent || await channel.guild?.channels?.fetch(channel.parentId).catch(() => null);
  return parent?.type === ChannelType.GuildForum;
}

export function availableLoot(post) {
  const result = [];
  for (const [chestIndex, chest] of (post?.chests || []).entries()) {
    for (const item of chest.items || []) {
      if (Number.isInteger(item.quantity) && item.quantity > 0) {
        result.push({ chest, chestIndex, item });
      }
    }
  }
  return result;
}

export function buildLootPanel(threadId, post) {
  const available = availableLoot(post);
  const chestCount = (post?.chests || []).length;
  if (chestCount === 0) {
    return { content: '🏴‍☠️ **' + post.name + '** has been fully looted. Everything is gone.', components: [] };
  }

  const lines = ['📦 **' + post.name + '** has **' + chestCount + '** chest(s).'];
  if (available.length === 0) {
    lines.push('These chests have no loot left to take.');
    return { content: lines.join('\n'), components: [] };
  }

  lines.push('Available loot:');
  lines.push(...available.slice(0, 25).map(({ chestIndex, item }) =>
    '• Chest ' + (chestIndex + 1) + ': **' + item.name + '**' + (item.kind === 'berry'
      ? ' — <:Berry:1573798988988031087> ' + item.quantity.toLocaleString() + ' Berries'
      : ' × ' + item.quantity)
  ));
  lines.push('Select an item below to take it. Item stacks give one item per selection; a Berry stack gives its listed amount.');

  const options = available.slice(0, 25).map(({ chest, chestIndex, item }) => ({
    label: (item.name + (item.kind === 'berry' ? ' — Berries' : ' × ' + item.quantity)).slice(0, 100),
    description: ('Chest ' + (chestIndex + 1) + ' • ' + item.quantity + (item.kind === 'berry' ? ' Berries' : ' available')).slice(0, 100),
    value: chest.id + '~' + item.id
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('loot_take:' + threadId)
    .setPlaceholder('Choose an item to take')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);
  return {
    content: lines.join('\n').slice(0, 3900),
    components: [new ActionRowBuilder().addComponents(menu)]
  };
}

export async function loadLootPost(client, guildId, threadId) {
  const loot = await loadLoot(client, guildId);
  return { loot, post: loot.posts?.[threadId] || null };
}

export async function saveLootPostConfig(client, guildId, loot) {
  return client.db.set('berry:loot:' + guildId, loot);
}
