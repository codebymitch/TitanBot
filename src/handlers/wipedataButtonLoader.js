import { wipedataConfirmHandler, wipedataCancelHandler } from './wipedataButtons.js';
import { logger } from '../utils/logger.js';





export default async function loadWipedataButtons(client) {
  try {
    client.buttons.set('wipedata_yes', wipedataConfirmHandler);
    client.buttons.set('wipedata_no', wipedataCancelHandler);
    
    logger.info('Wipedata button handlers loaded');
  } catch (error) {
    logger.error('Error loading wipedata button handlers:', error);
  }
}


