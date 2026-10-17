import loggingButtonsHandler from '../../../handlers/loggingButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

export default [
  {
    name: 'log_dash_toggle',
    execute: loggingButtonsHandler.execute,
  },
  {
    name: 'log_dash_refresh',
    execute: loggingButtonsHandler.execute,
  },
  {
    name: 'log_dash_back',
    execute: loggingButtonsHandler.execute,
  },
  {
    name: 'log_dash_add_filter',
    execute: loggingButtonsHandler.execute,
  },
  {
    name: 'log_dash_remove_filter',
    execute: loggingButtonsHandler.execute,
  },
] satisfies ButtonHandler[];
