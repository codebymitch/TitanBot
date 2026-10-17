import {
  warningDeleteSpecificHandler,
  warningClearAllHandler
} from '../../../handlers/warningHandlers.js';
import type { ButtonHandler } from '../../../types/index.js';

export default [
  warningDeleteSpecificHandler,
  warningClearAllHandler
] satisfies ButtonHandler[];
