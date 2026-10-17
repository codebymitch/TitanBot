import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import economyCommand from './modules/economy.js';
import shopConfigCommand from './modules/shop-config.js';

export default createRouterCommand({
  name: 'economy',
  description: 'Wirtschaftssystem konfigurieren',
  category: 'Economy',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  routes: [
    { legacyName: 'economy', module: economyCommand, spread: true },
    { legacyName: 'shop-config', module: shopConfigCommand },
  ],
});
