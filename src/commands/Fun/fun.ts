import { createRouterCommand } from '../../utils/commandRouter.js';
import fightCommand from './modules/fight.js';
import flipCommand from './modules/flip.js';
import rollCommand from './modules/roll.js';

export default createRouterCommand({
  name: 'fun',
  description: 'Spaß-Commands und Minispiele',
  category: 'Fun',
  routes: [
    { legacyName: 'fight', module: fightCommand },
    { legacyName: 'flip', module: flipCommand },
    { legacyName: 'roll', module: rollCommand },
  ],
});
