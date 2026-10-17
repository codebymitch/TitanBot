import calculateModalHandler from '../../../handlers/calculateModals.js';
import type { ModalHandler } from '../../../types/index.js';

const execute = typeof calculateModalHandler === 'function'
  ? calculateModalHandler
  : calculateModalHandler.execute;

export default {
  name: 'calc_modal',
  execute,
} satisfies ModalHandler;
