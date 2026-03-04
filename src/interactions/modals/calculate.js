import calculateModalHandler from '../../handlers/calculateModals.js';

const execute = typeof calculateModalHandler === 'function'
  ? calculateModalHandler
  : calculateModalHandler.execute;

export default {
  name: 'calc_modal',
  execute,
};