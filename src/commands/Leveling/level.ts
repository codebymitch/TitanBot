import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import levelCommand from './modules/level.js';
import leveladdCommand from './modules/leveladd.js';
import levelremoveCommand from './modules/levelremove.js';
import levelsetCommand from './modules/levelset.js';

export default createRouterCommand({
  name: 'level',
  description: 'Leveling konfigurieren und Level von Mitgliedern verwalten',
  category: 'Leveling',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  routes: [
    { legacyName: 'level', module: levelCommand, spread: true },
    { legacyName: 'leveladd', module: leveladdCommand },
    { legacyName: 'levelremove', module: levelremoveCommand },
    { legacyName: 'levelset', module: levelsetCommand },
  ],
});
