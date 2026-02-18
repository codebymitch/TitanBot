import { shopPurchaseHandler } from './shopButtons.js';
import { logger } from '../utils/logger.js';





export default async function loadShopButtons(client) {
  try {
    client.buttons.set('shop_buy', shopPurchaseHandler);
    
    logger.info('Shop button handlers loaded');
  } catch (error) {
    logger.error('Error loading shop button handlers:', error);
  }
}


