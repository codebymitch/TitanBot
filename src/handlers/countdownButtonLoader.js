import countdownButtonHandler from './countdownButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadCountdownButtons(client) {
  try {
    // Register both pause and cancel button handlers under countdown_pause and countdown_cancel
    client.buttons.set('countdown_pause', countdownButtonHandler);
    client.buttons.set('countdown_cancel', countdownButtonHandler);
    logger.info('Countdown button handlers loaded');
  } catch (error) {
    logger.error('Error loading countdown button handlers:', error);
  }
}
