import { logger } from '../../utils/logger.js';

// The music feature has been removed. Keep these exports temporarily for callers
// during rollout; no Lavalink client or voice listeners are initialized.
export function initializeMusic() {
  logger.info('Music feature removed; Lavalink initialization skipped.');
}
export function initRiffyAfterReady() {}
export async function shutdownMusic() {}
