import createTicketHandler, { 
  createTicketModalHandler, 
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  transcriptTicketHandler 
} from './ticketButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadTicketButtons(client) {
  try {
    // Load ticket button handlers
    client.buttons.set('create_ticket', createTicketHandler);
    client.buttons.set('ticket_close', closeTicketHandler);
    client.buttons.set('ticket_claim', claimTicketHandler);
    client.buttons.set('ticket_priority', priorityTicketHandler);
    client.buttons.set('ticket_transcript', transcriptTicketHandler);
    
    // Load modal handlers
    client.modals.set('create_ticket_modal', createTicketModalHandler);
    
    logger.info('Ticket button handlers loaded');
  } catch (error) {
    logger.error('Error loading ticket button handlers:', error);
  }
}
