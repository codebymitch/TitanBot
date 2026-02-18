import { helpBackButton, helpBugReportButton, helpPaginationButton } from './helpButtons.js';
import { logger } from '../utils/logger.js';





export default function loadHelpButtons(client) {
    try {
        client.buttons.set(helpBackButton.name, helpBackButton);
        client.buttons.set(helpBugReportButton.name, helpBugReportButton);
        client.buttons.set('help-page_first', helpPaginationButton);
        client.buttons.set('help-page_prev', helpPaginationButton);
        client.buttons.set('help-page_next', helpPaginationButton);
        client.buttons.set('help-page_last', helpPaginationButton);

        if (process.env.NODE_ENV !== 'production') {
            logger.debug('Help button handlers loaded');
        }
    } catch (error) {
        logger.error('Error loading help button handlers:', error);
    }
}


