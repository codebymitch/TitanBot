import { createRouterCommand } from '../../utils/commandRouter.js';
import verificationCommand from './modules/verification.js';
import autoverifyCommand from './modules/autoVerify.js';

export default createRouterCommand({
  name: 'verification',
  description: 'Verifizierung von Mitgliedern verwalten',
  category: 'Verification',
  routes: [
    { legacyName: 'verification', module: verificationCommand, spread: true },
    { legacyName: 'autoverify', module: autoverifyCommand },
  ],
});
