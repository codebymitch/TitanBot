import createTicketHandler, { 
  createTicketModalHandler, 
  closeTicketHandler, 
  claimTicketHandler, 
  priorityTicketHandler,
  transcriptTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler 
} from './ticketButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadTicketButtons(client) {
  try {
    client.buttons.set('create_ticket', createTicketHandler);
    client.buttons.set('ticket_close', closeTicketHandler);
    client.buttons.set('ticket_claim', claimTicketHandler);
    client.buttons.set('ticket_priority', priorityTicketHandler);
    client.buttons.set('ticket_transcript', transcriptTicketHandler);
    client.buttons.set('ticket_unclaim', unclaimTicketHandler);
    client.buttons.set('ticket_reopen', reopenTicketHandler);
    client.buttons.set('ticket_delete', deleteTicketHandler);
    
    client.modals.set('create_ticket_modal', createTicketModalHandler);
    
    logger.info('Ticket button handlers loaded');
  } catch (error) {
    logger.error('Error loading ticket button handlers:', error);
  }
}


