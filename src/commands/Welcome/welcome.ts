import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import autoroleCommand from './modules/autorole.js';
import goodbyeCommand from './modules/goodbye.js';
import greetCommand from './modules/greet.js';
import welcomeCommand from './modules/welcome.js';

export default createRouterCommand({
  name: 'welcome',
  description: 'Einstellungen für Willkommen, Abschied und Auto-Rolle',
  category: 'Welcome',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  routes: [
    { legacyName: 'autorole', module: autoroleCommand },
    { legacyName: 'goodbye', module: goodbyeCommand },
    { legacyName: 'greet', module: greetCommand },
    { legacyName: 'welcome', module: welcomeCommand },
  ],
});
