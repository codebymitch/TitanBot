import verificationButtonHandler from './verificationButtons.js';
import { logger } from '../utils/logger.js';





export async function loadVerificationButtons(client) {
    try {
        client.buttons.set(verificationButtonHandler.customId, verificationButtonHandler);
        logger.info('Verification button handler loaded');
    } catch (error) {
        logger.error('Error loading verification button handler:', error);
    }
}

export default loadVerificationButtons;



