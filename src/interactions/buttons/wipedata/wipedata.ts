import {
  wipedataConfirmHandler,
  wipedataCancelHandler,
} from '../../../handlers/wipedataButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

export default [wipedataConfirmHandler, wipedataCancelHandler] satisfies ButtonHandler[];
