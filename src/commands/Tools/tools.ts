import { createRouterCommand } from '../../utils/commandRouter.js';
import baseconvertCommand from './modules/baseconvert.js';
import calculateCommand from './modules/calculate.js';
import countdownCommand from './modules/countdown.js';
import generatepasswordCommand from './modules/generatepassword.js';
import hexcolorCommand from './modules/hexcolor.js';
import pollCommand from './modules/poll.js';
import randomuserCommand from './modules/randomuser.js';
import shortenCommand from './modules/shorten.js';
import timeCommand from './modules/time.js';
import unixtimeCommand from './modules/unixtime.js';
import weatherCommand from '../Utility/modules/weather.js';
import firstmsgCommand from '../Utility/modules/firstmsg.js';

export default createRouterCommand({
  name: 'tools',
  description: 'Praktische Tools und Helfer',
  category: 'Tools',
  routes: [
    { legacyName: 'baseconvert', module: baseconvertCommand },
    { legacyName: 'calculate', module: calculateCommand },
    { legacyName: 'countdown', module: countdownCommand },
    { legacyName: 'generatepassword', module: generatepasswordCommand },
    { legacyName: 'hexcolor', module: hexcolorCommand },
    { legacyName: 'poll', module: pollCommand },
    { legacyName: 'randomuser', module: randomuserCommand },
    { legacyName: 'shorten', module: shortenCommand },
    { legacyName: 'time', module: timeCommand },
    { legacyName: 'unixtime', module: unixtimeCommand },
    { legacyName: 'weather', module: weatherCommand },
    { legacyName: 'firstmsg', module: firstmsgCommand },
  ],
});
