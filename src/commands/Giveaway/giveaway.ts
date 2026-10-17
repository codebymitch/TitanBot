import { PermissionFlagsBits } from 'discord.js';
import { createRouterCommand } from '../../utils/commandRouter.js';
import gcreateCommand from './modules/gcreate.js';
import gdeleteCommand from './modules/gdelete.js';
import gendCommand from './modules/gend.js';
import grerollCommand from './modules/greroll.js';

export default createRouterCommand({
  name: 'giveaway',
  description: 'Giveaways erstellen und verwalten',
  category: 'Giveaway',
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  routes: [
    { legacyName: 'gcreate', module: gcreateCommand },
    { legacyName: 'gdelete', module: gdeleteCommand },
    { legacyName: 'gend', module: gendCommand },
    { legacyName: 'greroll', module: grerollCommand },
  ],
});
