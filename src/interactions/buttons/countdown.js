import countdownButtonHandler from '../../handlers/countdownButtons.js';

export default [
  {
    name: 'countdown_pause',
    execute: countdownButtonHandler,
  },
  {
    name: 'countdown_cancel',
    execute: countdownButtonHandler,
  },
];