import { warningDeleteModalHandler, warningClearConfirmModalHandler } from '../../../handlers/warningHandlers.js';

const deleteExecute = typeof warningDeleteModalHandler === 'function'
  ? warningDeleteModalHandler
  : warningDeleteModalHandler.execute;

const clearExecute = typeof warningClearConfirmModalHandler === 'function'
  ? warningClearConfirmModalHandler
  : warningClearConfirmModalHandler.execute;

export default [
  {
    name: 'warning_delete_modal',
    execute: deleteExecute
  },
  {
    name: 'warning_clear_confirm_modal',
    execute: clearExecute
  }
];