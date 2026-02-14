import loggingButtonsHandler from './loggingButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadLoggingButtons(client) {
  try {
    client.buttons.set('logging_toggle', loggingButtonsHandler);
    client.buttons.set('logging_refresh_status', loggingButtonsHandler);
    logger.info('Logging button handlers loaded');
  } catch (error) {
    logger.error('Error loading logging button handlers:', error);
  }
}
