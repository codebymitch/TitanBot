import createTicketHandler, {
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
} from '../../../handlers/ticketButtons.js';

export default [
  createTicketHandler,
  closeTicketHandler,
  claimTicketHandler,
  priorityTicketHandler,
  pinTicketHandler,
  unclaimTicketHandler,
  reopenTicketHandler,
  deleteTicketHandler,
];