import todoAddHandler, { sharedTodoCompleteHandler, sharedTodoRemoveHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler, sharedTodoRemoveModalHandler } from './todoButtons.js';
import { logger } from '../utils/logger.js';

export default async function loadTodoButtons(client) {
  try {
    client.buttons.set('shared_todo_add', todoAddHandler);
    
    client.buttons.set('shared_todo_complete', sharedTodoCompleteHandler);
    client.buttons.set('shared_todo_remove', sharedTodoRemoveHandler);
    
    client.modals.set('shared_todo_add_modal', sharedTodoAddModalHandler);
    client.modals.set('shared_todo_complete_modal', sharedTodoCompleteModalHandler);
    client.modals.set('shared_todo_remove_modal', sharedTodoRemoveModalHandler);
    
    logger.info('Todo button handlers loaded');
  } catch (error) {
    logger.error('Error loading todo button handlers:', error);
  }
}


