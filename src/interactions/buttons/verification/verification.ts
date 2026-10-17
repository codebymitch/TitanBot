import verificationButtonHandler from '../../../handlers/verificationButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

export default {
  name: verificationButtonHandler.customId,
  execute: verificationButtonHandler.execute,
} satisfies ButtonHandler;
