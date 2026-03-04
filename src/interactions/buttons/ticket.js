import createTicketHandler, {
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  transcriptTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
} from '../../handlers/ticketButtons.js';

export default [
  createTicketHandler,
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  transcriptTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];