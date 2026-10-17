import {
  sharedTodoAddModalHandler,
  sharedTodoCompleteModalHandler,
  sharedTodoRemoveModalHandler,
} from '../../../handlers/todoButtons.js';
import type { ModalHandler } from '../../../types/index.js';

export default [
  sharedTodoAddModalHandler,
  sharedTodoCompleteModalHandler,
  sharedTodoRemoveModalHandler,
] satisfies ModalHandler[];
