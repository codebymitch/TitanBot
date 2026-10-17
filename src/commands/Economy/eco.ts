import { createRouterCommand } from '../../utils/commandRouter.js';
import balanceCommand from './modules/balance.js';
import begCommand from './modules/beg.js';
import buyCommand from './modules/buy.js';
import crimeCommand from './modules/crime.js';
import dailyCommand from './modules/daily.js';
import depositCommand from './modules/deposit.js';
import eleaderboardCommand from './modules/eleaderboard.js';
import fishCommand from './modules/fish.js';
import gambleCommand from './modules/gamble.js';
import inventoryCommand from './modules/inventory.js';
import mineCommand from './modules/mine.js';
import payCommand from './modules/pay.js';
import robCommand from './modules/rob.js';
import shopCommand from './modules/shop.js';
import slutCommand from './modules/slut.js';
import withdrawCommand from './modules/withdraw.js';
import workCommand from './modules/work.js';

export default createRouterCommand({
  name: 'eco',
  description: 'Wirtschaft: Kontostand, Arbeiten, Shop und mehr',
  category: 'Economy',
  routes: [
    { legacyName: 'balance', module: balanceCommand },
    { legacyName: 'beg', module: begCommand },
    { legacyName: 'buy', module: buyCommand },
    { legacyName: 'crime', module: crimeCommand },
    { legacyName: 'daily', module: dailyCommand },
    { legacyName: 'deposit', module: depositCommand },
    { legacyName: 'eleaderboard', module: eleaderboardCommand },
    { legacyName: 'fish', module: fishCommand },
    { legacyName: 'gamble', module: gambleCommand },
    { legacyName: 'inventory', module: inventoryCommand },
    { legacyName: 'mine', module: mineCommand },
    { legacyName: 'pay', module: payCommand },
    { legacyName: 'rob', module: robCommand },
    { legacyName: 'shop', module: shopCommand },
    { legacyName: 'slut', module: slutCommand },
    { legacyName: 'withdraw', module: withdrawCommand },
    { legacyName: 'work', module: workCommand },
  ],
});
