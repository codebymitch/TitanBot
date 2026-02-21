import counterDeleteActionHandler from './counterButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadCounterButtons(client) {
  try {
    client.buttons.set(counterDeleteActionHandler.name, counterDeleteActionHandler);
    logger.info('Counter button handlers loaded');
  } catch (error) {
    logger.error('Error loading counter button handlers:', error);
  }
}
