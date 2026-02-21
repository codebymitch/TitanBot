import calculateModalHandler from './calculateModals.js';
import { logger } from '../utils/logger.js';

export default async function loadCalculateModals(client) {
  try {
    client.modals.set('calc_modal', calculateModalHandler);
    logger.info('Calculate modal handlers loaded');
  } catch (error) {
    logger.error('Error loading calculate modal handlers:', error);
  }
}
