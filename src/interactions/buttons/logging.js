import loggingButtonsHandler from '../../handlers/loggingButtons.js';

export default [
  {
    name: 'logging_toggle',
    execute: loggingButtonsHandler.execute,
  },
  {
    name: 'logging_refresh_status',
    execute: loggingButtonsHandler.execute,
  },
];