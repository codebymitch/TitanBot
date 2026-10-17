import countdownButtonHandler from '../../../handlers/countdownButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

export default [
  {
    name: 'countdown_pause',
    execute: countdownButtonHandler,
  },
  {
    name: 'countdown_cancel',
    execute: countdownButtonHandler,
  },
] satisfies ButtonHandler[];
