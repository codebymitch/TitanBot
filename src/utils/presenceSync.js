import { botConfig } from '../config/botConfig.js';

export function applyPresence(client) {
  client.user.setPresence(botConfig.presence);
}

export function syncFromGuild(client) {
  applyPresence(client);
}
