import { createRouterCommand } from '../../utils/commandRouter.js';
import pingCommand from './modules/ping.js';
import statsCommand from './modules/stats.js';
import supportCommand from './modules/support.js';
import uptimeCommand from './modules/uptime.js';

export default createRouterCommand({
  name: 'bot',
  description: 'Status und Infos zum Bot',
  category: 'Core',
  routes: [
    { legacyName: 'ping', module: pingCommand },
    { legacyName: 'stats', module: statsCommand },
    { legacyName: 'support', module: supportCommand },
    { legacyName: 'uptime', module: uptimeCommand },
  ],
});
