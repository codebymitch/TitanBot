import { getEconomyData, setEconomyData } from '../utils/economy.js';

const key = (kind, guildId) => 'berry:' + kind + ':' + guildId;
const defaultLoot = () => ({ locations: {}, tables: { common: [], rare: [], epic: [] } });
const defaultJourneyConfig = () => ({ islands: ['Foosha Village', 'Alabasta', 'Water 7', 'Dressrosa', 'Wano'], durationMinutes: 3, manualChannelId: null });

export async function loadConfig(client, kind, guildId, fallback = {}) {
  const value = await client.db.get(key(kind, guildId), fallback);
  return value && typeof value === 'object' ? value : fallback;
}

export async function saveConfig(client, kind, guildId, value) {
  await client.db.set(key(kind, guildId), value);
  return value;
}

export async function adjustBerries(client, guildId, userId, delta) {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Berry amount must be a non-zero whole number.');
  const account = await getEconomyData(client, guildId, userId);
  const next = account.wallet + delta;
  if (!Number.isSafeInteger(next) || next < 0) throw new Error('Not enough berries for this purchase.');
  account.wallet = next;
  await setEconomyData(client, guildId, userId, account);
  return next;
}

export async function loadShops(client, guildId) {
  return loadConfig(client, 'shops', guildId, {});
}

export async function loadMerchants(client, guildId) {
  return loadConfig(client, 'merchants', guildId, { regular: [], black_market: [] });
}

export async function loadLoot(client, guildId) {
  const saved = await loadConfig(client, 'loot', guildId, defaultLoot());
  return { ...defaultLoot(), ...saved, tables: { ...defaultLoot().tables, ...(saved.tables || {}) } };
}

export async function loadJourneyConfig(client, guildId) {
  const saved = await loadConfig(client, 'journey-config', guildId, defaultJourneyConfig());
  const config = { ...defaultJourneyConfig(), ...saved };
  config.durationMinutes = Math.min(3, Math.max(1, Number(config.durationMinutes) || 3));
  return config;
}

export function isStaff(interaction) {
  return Boolean(interaction.memberPermissions?.has('Administrator') || interaction.memberPermissions?.has('ManageGuild'));
}

export function cleanName(value) {
  return String(value || '').trim().slice(0, 80);
}

export function berryLabel(amount) {
  return amount === 1 ? 'Berry' : 'Berries';
}

export const JOURNEY_EVENTS = [
  '🌊 Calm waters: the sea is quiet. Nothing interrupts the journey.',
  '⚓ Marine encounter: a Marine ship is spotted nearby, but it does not engage.',
  '🏴‍☠️ Pirate encounter: another crew crosses paths with yours.',
  '🐋 Sea beast: a huge creature surfaces beside the ship.',
  '⛈️ Storm: rough weather slows the ship down.',
  '🪢 Stranded: the ship has trouble and needs repairs before continuing.',
  '💰 Treasure discovery: the crew finds a small stash of treasure at sea.',
  '🏝️ Mysterious island: an uncharted island appears on the horizon.'
];

export function randomJourneyEvent() {
  return JOURNEY_EVENTS[Math.floor(Math.random() * JOURNEY_EVENTS.length)];
}

export { defaultLoot, defaultJourneyConfig, key };
