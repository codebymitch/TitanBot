import { warningDeleteModalHandler, warningClearConfirmModalHandler } from '../../../handlers/warningHandlers.js';
import type { ModalHandler } from '../../../types/index.js';

// Both handlers are plain functions (the JS also checked for an { execute } object, which never applied).
const deleteExecute = warningDeleteModalHandler;

const clearExecute = warningClearConfirmModalHandler;

export default [
  {
    name: 'warning_delete_modal',
    execute: deleteExecute
  },
  {
    name: 'warning_clear_confirm_modal',
    execute: clearExecute
  }
] satisfies ModalHandler[];