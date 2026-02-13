import todoAddHandler, { sharedTodoCompleteHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler } from './todoButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadTodoButtons(client) {
  try {
    client.buttons.set('shared_todo_add', todoAddHandler);
    
    client.buttons.set('shared_todo_complete', sharedTodoCompleteHandler);
    
    client.modals.set('shared_todo_add_modal', sharedTodoAddModalHandler);
    client.modals.set('shared_todo_complete_modal', sharedTodoCompleteModalHandler);
    
    logger.info('Todo button handlers loaded');
  } catch (error) {
    logger.error('Error loading todo button handlers:', error);
  }
}


