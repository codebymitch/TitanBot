import { handleLoggingMenuSelect } from '../../../handlers/loggingButtons.js';
import type { SelectMenuHandler } from '../../../types/index.js';

export default {
  name: 'log_dash_menu',
  execute: handleLoggingMenuSelect,
} satisfies SelectMenuHandler;
