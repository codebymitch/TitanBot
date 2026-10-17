import { createRouterCommand } from '../../utils/commandRouter.js';
import musicCommand from './modules/music.js';
import joinCommand from './modules/join.js';
import playCommand from './modules/play.js';
import queueCommand from './modules/queue.js';
import nowplayingCommand from './modules/nowplaying.js';

export default createRouterCommand({
  name: 'music',
  description: 'Musik abspielen und steuern',
  category: 'Music',
  routes: [
    { legacyName: 'music', module: musicCommand, spread: true },
    { legacyName: 'join', module: joinCommand },
    { legacyName: 'play', module: playCommand },
    { legacyName: 'queue', module: queueCommand },
    { legacyName: 'nowplaying', module: nowplayingCommand },
  ],
});
