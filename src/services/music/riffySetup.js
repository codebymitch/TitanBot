import { logger } from '../../utils/logger.js';

// Removed feature: music playback is intentionally disabled.
export function initializeMusic() {
  logger.info('Music feature disabled; skipping Lavalink initialization.');
}

export function initRiffyAfterReady() {
  // Music playback is disabled.
}
