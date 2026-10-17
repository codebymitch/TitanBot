import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import kickCommand from './modules/kick.js';
import masskickCommand from './modules/masskick.js';

export default createRouterCommand({
  name: 'kick',
  description: 'Mitglieder kicken',
  category: 'Moderation',
  defaultMemberPermissions: PermissionFlagsBits.KickMembers,
  routes: [
    { legacyName: 'kick', module: kickCommand },
    { legacyName: 'masskick', module: masskickCommand },
  ],
});
