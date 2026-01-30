import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../services/database.js';

const sharedTodoAddHandler = {
  name: 'shared_todo_add',
  async execute(interaction, client, args) {
    const listId = args[0];
    
    // Create a modal for task input
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}`)
      .setTitle('Add Task to Shared List');

    const taskInput = new TextInputBuilder()
      .setCustomId('task_text')
      .setLabel('Enter the task description')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const actionRow = new ActionRowBuilder().addComponents(taskInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoCompleteHandler = {
  name: 'shared_todo_complete',
  async execute(interaction, client, args) {
    const listId = args[0];
    
    // Create a modal for task ID input
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}`)
      .setTitle('Complete Task in Shared List');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Enter the task ID to complete')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('e.g., 1, 2, 3');

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoAddModalHandler = {
  name: 'shared_todo_add_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const taskText = interaction.fields.getTextInputValue('task_text');
    const userId = interaction.user.id;

    try {
      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "Shared list not found.")],
          ephemeral: true
        });
      }

      // Check if user is a member
      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "You don't have access to this list.")],
          ephemeral: true
        });
      }

      // Ensure listData has the required structure
      if (!listData.tasks) listData.tasks = [];
      if (!listData.nextId) listData.nextId = 1;

      // Add the task
      const newTask = {
        id: listData.nextId++,
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        createdBy: userId
      };
      
      listData.tasks.push(newTask);
      await setInDb(listKey, listData);

      return interaction.reply({
        embeds: [successEmbed("Task Added", `Added "${taskText}" to the shared list.`)],
        ephemeral: true
      });

    } catch (error) {
      console.error("Error in shared todo add modal:", error);
      return interaction.reply({
        embeds: [errorEmbed("Error", "An error occurred while adding the task.")],
        ephemeral: true
      });
    }
  }
};

const sharedTodoCompleteModalHandler = {
  name: 'shared_todo_complete_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'));
    const userId = interaction.user.id;

    try {
      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "Shared list not found.")],
          ephemeral: true
        });
      }

      // Check if user is a member
      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "You don't have access to this list.")],
          ephemeral: true
        });
      }

      // Ensure listData has the required structure
      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(t => t.id === taskId);
      
      if (!task) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "Task not found.")],
          ephemeral: true
        });
      }
      
      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();
      
      await setInDb(listKey, listData);
      
      return interaction.reply({
        embeds: [successEmbed("Task Completed", `Marked "${task.text}" as complete!`)],
        ephemeral: true
      });

    } catch (error) {
      console.error("Error in shared todo complete modal:", error);
      return interaction.reply({
        embeds: [errorEmbed("Error", "An error occurred while completing the task.")],
        ephemeral: true
      });
    }
  }
};

export default sharedTodoAddHandler;
export { sharedTodoCompleteHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler };
