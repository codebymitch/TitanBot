const guildPlayers = new Map();

export function getPlayerState(guildId) {
  return guildPlayers.get(guildId) || null;
}

export function setPlayerState(guildId, state) {
  guildPlayers.set(guildId, state);
  return state;
}

export function clearPlayerState(guildId) {
  return guildPlayers.delete(guildId);
}

export function getAllPlayerStates() {
  return Array.from(guildPlayers.entries());
}
