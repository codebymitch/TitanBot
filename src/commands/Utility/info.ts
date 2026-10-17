import { createRouterCommand } from '../../utils/commandRouter.js';
import avatarCommand from './modules/avatar.js';
import serverinfoCommand from './modules/serverinfo.js';
import userinfoCommand from './modules/userinfo.js';

export default createRouterCommand({
  name: 'info',
  description: 'Infos über Nutzer und den Server',
  category: 'Utility',
  routes: [
    { legacyName: 'avatar', module: avatarCommand },
    { legacyName: 'serverinfo', module: serverinfoCommand },
    { legacyName: 'userinfo', module: userinfoCommand },
  ],
});
