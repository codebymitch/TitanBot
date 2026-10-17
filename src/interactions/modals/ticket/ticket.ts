import {
  createTicketModalHandler,
  closeTicketModalHandler,
} from '../../../handlers/ticketButtons.js';
import type { ModalHandler } from '../../../types/index.js';

export default [createTicketModalHandler, closeTicketModalHandler] satisfies ModalHandler[];
