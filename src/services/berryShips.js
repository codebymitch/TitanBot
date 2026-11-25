import { randomUUID } from 'node:crypto';

const boatsKey = (guildId, userId) => 'berry:boats:' + guildId + ':' + userId;

export const SHIP_CLASSES = {
  caravel: { label: 'Caravel', basePrice: 10000000, classSpeed: 1 },
  brigantine: { label: 'Brigantine', basePrice: 50000000, classSpeed: 0.9 },
  custom: { label: 'Advanced / Custom Ship', basePrice: 200000000, classSpeed: 0.8 },
};

export const SHIP_QUALITIES = {
  standard: { label: 'Standard', travelSpeed: 1, priceMultiplier: 1 },
  fast: { label: 'Fast', travelSpeed: 0.75, priceMultiplier: 1.5 },
  damaged: { label: 'Damaged', travelSpeed: 1.25, priceMultiplier: 0.5 },
  special: { label: 'Special Vessel', travelSpeed: 0.5, priceMultiplier: 3 },
};

export async function getBoats(client, guildId, userId) {
  const boats = await client.db.get(boatsKey(guildId, userId), []);
  return Array.isArray(boats) ? boats : [];
}

export async function saveBoats(client, guildId, userId, boats) {
  await client.db.set(boatsKey(guildId, userId), boats);
  return boats;
}

export function priceBoat(shipClass, quality, customPrice = null) {
  const ship = SHIP_CLASSES[shipClass];
  const condition = SHIP_QUALITIES[quality];
  if (!ship || !condition) throw new Error('Choose a valid ship class and quality.');
  const base = shipClass === 'custom' ? Number(customPrice) : ship.basePrice;
  if (!Number.isSafeInteger(base) || base < ship.basePrice) {
    throw new Error('Custom ships must cost at least 200,000,000 Berries.');
  }
  const price = Math.round(base * condition.priceMultiplier);
  if (!Number.isSafeInteger(price)) throw new Error('Ship price is too large.');
  return price;
}

export function calculateTravelDuration(baseMinutes, boat) {
  const baseMs = Math.min(180000, Math.max(60000, Number(baseMinutes) * 60000));
  const ship = SHIP_CLASSES[boat.shipClass] || SHIP_CLASSES.caravel;
  const condition = SHIP_QUALITIES[boat.quality] || SHIP_QUALITIES.standard;
  return Math.max(15000, Math.min(180000, Math.round(baseMs * ship.classSpeed * condition.travelSpeed)));
}

export function createBoat({ name, shipClass, quality, price = 0 }) {
  return {
    id: randomUUID(),
    name: String(name || '').trim().slice(0, 80),
    shipClass,
    quality,
    price,
    createdAt: Date.now(),
  };
}

export function formatShip(boat) {
  const ship = SHIP_CLASSES[boat.shipClass] || SHIP_CLASSES.custom;
  const quality = SHIP_QUALITIES[boat.quality] || SHIP_QUALITIES.standard;
  return quality.label + ' ' + ship.label + ' — **' + boat.name + '**';
}
