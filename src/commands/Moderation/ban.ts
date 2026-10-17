import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import banCommand from './modules/ban.js';
import unbanCommand from './modules/unban.js';
import massbanCommand from './modules/massban.js';

export default createRouterCommand({
  name: 'ban',
  description: 'Mitglieder bannen, entbannen und massenhaft bannen',
  category: 'Moderation',
  defaultMemberPermissions: PermissionFlagsBits.BanMembers,
  routes: [
    { legacyName: 'ban', module: banCommand },
    { legacyName: 'unban', module: unbanCommand },
    { legacyName: 'massban', module: massbanCommand },
  ],
});
