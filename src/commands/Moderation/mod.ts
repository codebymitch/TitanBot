import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import timeoutCommand from './modules/timeout.js';
import untimeoutCommand from './modules/untimeout.js';
import warnCommand from './modules/warn.js';
import warningsCommand from './modules/warnings.js';
import dmCommand from './modules/dm.js';

export default createRouterCommand({
  name: 'mod',
  description: 'Timeouts, Verwarnungen und Moderator-DMs',
  category: 'Moderation',
  defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
  routes: [
    { legacyName: 'timeout', module: timeoutCommand },
    { legacyName: 'untimeout', module: untimeoutCommand },
    { legacyName: 'warn', module: warnCommand },
    { legacyName: 'warnings', module: warningsCommand },
    { legacyName: 'dm', module: dmCommand },
  ],
});
