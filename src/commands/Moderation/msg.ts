import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import purgeCommand from './modules/purge.js';
import sayCommand from './modules/say.js';
import embedbuilderCommand from '../Tools/modules/embedbuilder.js';
import usernotesCommand from './modules/usernotes.js';

export default createRouterCommand({
  name: 'msg',
  description: 'Nachrichten löschen, senden und erstellen, Nutzernotizen',
  category: 'Moderation',
  defaultMemberPermissions: PermissionFlagsBits.ManageMessages,
  routes: [
    { legacyName: 'purge', module: purgeCommand },
    { legacyName: 'say', module: sayCommand },
    { legacyName: 'embedbuilder', module: embedbuilderCommand },
    { legacyName: 'usernotes', module: usernotesCommand },
  ],
});
