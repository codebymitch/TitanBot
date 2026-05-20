/**
 * Help Ticket Button Interactions
 * 
 * Exports the button handlers for the support ticket system.
 */

import {
  helpCreateTicketHandler,
  helpCloseTicketHandler
} from '../../handlers/helpTicketButtons.js';

export default [
  helpCreateTicketHandler,
  helpCloseTicketHandler,
];