import todoAddHandler, {
  sharedTodoCompleteHandler,
  sharedTodoRemoveHandler,
} from '../../../handlers/todoButtons.js';
import type { ButtonHandler } from '../../../types/index.js';

export default [
  todoAddHandler,
  sharedTodoCompleteHandler,
  sharedTodoRemoveHandler,
] satisfies ButtonHandler[];
