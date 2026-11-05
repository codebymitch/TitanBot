import { logger } from '../../utils/logger.js';

// Music playback is removed; no Lavalink client or voice listeners are started.
export function initializeMusic() { logger.info('Music playback is disabled.'); }
export function initRiffyAfterReady() {}
