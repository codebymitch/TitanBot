import { createRouterCommand } from '../../utils/commandRouter.js';
import claimCommand from './modules/claim.js';
import closeCommand from './modules/close.js';
import priorityCommand from './modules/priority.js';

export default createRouterCommand({
  name: 'tickets',
  description: 'Ticket-Aktionen in einem Ticket-Kanal',
  category: 'Ticket',
  routes: [
    { legacyName: 'claim', module: claimCommand },
    { legacyName: 'close', module: closeCommand },
    { legacyName: 'priority', module: priorityCommand },
  ],
});
