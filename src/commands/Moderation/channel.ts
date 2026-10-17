import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import lockCommand from './modules/lock.js';
import unlockCommand from './modules/unlock.js';

export default createRouterCommand({
  name: 'channel',
  description: 'Kanäle sperren und entsperren',
  category: 'Moderation',
  defaultMemberPermissions: PermissionFlagsBits.ManageChannels,
  routes: [
    { legacyName: 'lock', module: lockCommand },
    { legacyName: 'unlock', module: unlockCommand },
  ],
});
