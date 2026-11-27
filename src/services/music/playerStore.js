const guildPlayers = new Map();
const guildUpdateIntervals = new Map();

export function getPlayerState(guildId) {
  return guildPlayers.get(guildId) || null;
}

export function setPlayerState(guildId, state) {
  guildPlayers.set(guildId, state);
  return state;
}

export function clearPlayerState(guildId) {
  clearUpdateInterval(guildId);
  return guildPlayers.delete(guildId);
}

export function getAllPlayerStates() {
  return Array.from(guildPlayers.entries());
}

export function getGuildMusicData(guildId) {
  return guildPlayers.get(guildId) || null;
}

export function setGuildMusicData(guildId, data) {
  guildPlayers.set(guildId, data);
  return data;
}

export function clearGuildMusicData(guildId) {
  return clearPlayerState(guildId);
}

export function setUpdateInterval(guildId, intervalId) {
  clearUpdateInterval(guildId);
  if (intervalId) {
    guildUpdateIntervals.set(guildId, intervalId);
  }
}

export function clearUpdateInterval(guildId) {
  const intervalId = guildUpdateIntervals.get(guildId);
  if (intervalId) {
    clearInterval(intervalId);
    guildUpdateIntervals.delete(guildId);
  }

  const state = guildPlayers.get(guildId);
  if (state?.updateInterval) {
    clearInterval(state.updateInterval);
    state.updateInterval = null;
  }
}
