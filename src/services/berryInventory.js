import { createHash } from 'node:crypto';

export function inventoryLabel(key, metadata = {}) {
  const savedName = metadata?.[key]?.name;
  if (typeof savedName === 'string' && savedName.trim()) return savedName.trim();
  return String(key)
    .replace(/^(loot_|shop_|merchant_)/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase()) || 'Unknown item';
}

export function inventoryEntries(account) {
  const inventory = account?.inventory || {};
  const metadata = account?.inventoryMeta || {};
  return Object.entries(inventory)
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .map(([key, count]) => ({ key, count, name: inventoryLabel(key, metadata), metadata: metadata[key] || {} }));
}

export function inventoryToken(key) {
  return createHash('sha256').update(String(key)).digest('hex').slice(0, 20);
}

export function findInventoryEntry(account, tokenOrKey) {
  return inventoryEntries(account).find(entry =>
    entry.key === tokenOrKey || inventoryToken(entry.key) === tokenOrKey
  ) || null;
}

export function removeInventoryCount(account, key, amount) {
  account.inventory ||= {};
  const current = Number(account.inventory[key] || 0);
  if (!Number.isInteger(amount) || amount < 1 || current < amount) return false;
  const remaining = current - amount;
  if (remaining > 0) account.inventory[key] = remaining;
  else {
    delete account.inventory[key];
    if (account.inventoryMeta) delete account.inventoryMeta[key];
  }
  return true;
}

export function addInventoryCount(account, key, amount, name, extraMetadata = {}) {
  account.inventory ||= {};
  account.inventoryMeta ||= {};
  account.inventory[key] = Number(account.inventory[key] || 0) + amount;
  if (name) account.inventoryMeta[key] = { ...(account.inventoryMeta[key] || {}), ...extraMetadata, name };
}
