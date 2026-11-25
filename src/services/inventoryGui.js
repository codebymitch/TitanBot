import { ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { createEmbed } from '../utils/embeds.js';
import { formatCurrency } from '../utils/economy.js';
import { inventoryEntries } from './berryInventory.js';

const FILTERS = [
  { name: 'All items', value: 'all', emoji: '🎒' },
  { name: 'Weapons', value: 'weapon', emoji: '⚔️' },
  { name: 'Devil Fruits', value: 'devil_fruit', emoji: '🍈' },
  { name: 'Other gear', value: 'item', emoji: '🧭' }
];

function getKind(entry) {
  const kind = entry.metadata?.kind;
  return ['weapon', 'devil_fruit'].includes(kind) ? kind : 'item';
}

function worthLabel(item) {
  const worth = item.metadata?.worth;
  if (!Number.isSafeInteger(worth) || worth < 0) return 'worth not listed';
  const total = worth * item.count;
  if (!Number.isSafeInteger(total)) return formatCurrency(worth) + ' each';
  return formatCurrency(worth) + ' each · ' + formatCurrency(total) + ' total';
}

export function buildInventoryGui({ user, account, viewerId, targetId, filter = 'all' }) {
  const allItems = inventoryEntries(account);
  const filtered = filter === 'all' ? allItems : allItems.filter(item => getKind(item) === filter);
  const lines = filtered.slice(0, 28).map(item =>
    '• **' + item.name + '** × ' + item.count + ' — ' + worthLabel(item)
  );
  if (filtered.length > 28) lines.push('…and ' + (filtered.length - 28) + ' more. Choose a category to narrow the list.');

  const sections = [
    '💰 **Berry wallet:** ' + formatCurrency(account.wallet || 0),
    account.heldItem?.name
      ? '🗡️ **In hand:** **' + account.heldItem.name + '** — ' + worthLabel({ metadata: account.heldItem.metadata || {}, count: 1 })
      : '🗡️ **In hand:** empty'
  ];
  sections.push('**Cargo hold — ' + (filter === 'all' ? 'All items' : FILTERS.find(option => option.value === filter)?.name || 'Items') + '**');
  sections.push(lines.length ? lines.join('\n') : 'Nothing in this section yet.');

  const embed = createEmbed({
    title: 'Grand Line Cargo Hold',
    description: sections.join('\n\n').slice(0, 4000),
    color: 'economy',
    footer: 'Choose a cargo section below to sort your items.'
  }).setAuthor({ name: user.username + ' • Pirate Inventory' })
    .setThumbnail(user.displayAvatarURL());

  const availableKinds = new Set(allItems.map(getKind));
  const options = FILTERS.filter(option => option.value === 'all' || availableKinds.has(option.value))
    .map(option => ({ label: option.name, value: option.value, emoji: option.emoji, default: filter === option.value }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId('inventory_view:' + viewerId + ':' + targetId)
    .setPlaceholder('Browse cargo categories')
    .addOptions(options);
  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}
