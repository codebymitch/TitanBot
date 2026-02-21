import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

function buildSharedTodoViewPayload(listData, listId, guild) {
  const memberList = (listData.members || []).map(memberId => {
    const member = guild?.members?.cache?.get(memberId);
    return member ? member.user.username : `<@${memberId}>`;
  }).join(', ');

  const owner = guild?.members?.cache?.get(listData.creatorId);
  const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

  const tasks = Array.isArray(listData.tasks) ? listData.tasks : [];

  if (tasks.length === 0) {
    return {
      embeds: [
        successEmbed(
          `📋 **${listData.name}**\n\n` +
          `👑 **Owner:** ${ownerName}\n` +
          `👥 **Members:** ${memberList}\n\n` +
          '*This list is currently empty. Use the "Add Task" button to add tasks!*',
          `Shared List (ID: \`${listId}\`)`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shared_todo_add_${listId}`)
            .setLabel('Add Task')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shared_todo_complete_${listId}`)
            .setLabel('Complete Task')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`shared_todo_remove_${listId}`)
            .setLabel('Remove Task')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    };
  }

  const taskList = tasks
    .map(task =>
      `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
      `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
      (task.completed ? ` • Completed by <@${task.completedBy}>` : '') + '`'
    )
    .join('\n');

  return {
    embeds: [
      successEmbed(
        `📋 **${listData.name}**\n\n` +
        `👑 **Owner:** ${ownerName}\n` +
        `👥 **Members:** ${memberList}\n\n` +
        `**Tasks:**\n${taskList}`,
        `Shared List (ID: \`${listId}\`)`
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`shared_todo_add_${listId}`)
          .setLabel('Add Task')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`shared_todo_complete_${listId}`)
          .setLabel('Complete Task')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`shared_todo_remove_${listId}`)
          .setLabel('Remove Task')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

async function refreshSharedTodoMessage(interaction, listId, messageId) {
  if (!messageId || !interaction.channel) {
    return;
  }

  const listKey = `shared_todo_${listId}`;
  const listData = await getFromDb(listKey, null);
  if (!listData) {
    return;
  }

  try {
    const targetMessage = await interaction.channel.messages.fetch(messageId);
    if (!targetMessage) {
      return;
    }

    const updatedPayload = buildSharedTodoViewPayload(listData, listId, interaction.guild);
    await targetMessage.edit(updatedPayload);
  } catch (error) {
    logger.warn('Unable to refresh shared todo view message', {
      listId,
      messageId,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      error: error.message
    });
  }
}

const sharedTodoAddHandler = {
  name: 'shared_todo_add',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Invalid shared list ID.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}:${sourceMessageId || ''}`)
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
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Invalid shared list ID.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}:${sourceMessageId || ''}`)
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

const sharedTodoRemoveHandler = {
  name: 'shared_todo_remove',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await interaction.reply({
        embeds: [errorEmbed('Error', 'Invalid shared list ID.')],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_remove_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Remove Task from Shared List');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('Enter the task ID to remove')
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
    const sourceMessageId = args[1] || null;
    const taskText = interaction.fields.getTextInputValue('task_text');
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_add`, 5, 30000);
      if (!allowed) {
        return interaction.reply({
          embeds: [errorEmbed('Rate Limited', 'You are adding tasks too quickly. Please wait and try again.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Invalid shared list ID.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!taskText || taskText.trim().length === 0) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Task text cannot be empty.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "Shared list not found.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "You don't have access to this list.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.tasks) listData.tasks = [];
      if (!listData.nextId) listData.nextId = 1;

      const newTask = {
        id: listData.nextId++,
        text: taskText,
        completed: false,
        createdAt: new Date().toISOString(),
        createdBy: userId
      };
      
      listData.tasks.push(newTask);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [successEmbed("Task Added", `Added "${taskText}" to the shared list.`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo add modal:', error);
      return interaction.reply({
        embeds: [errorEmbed("Error", "An error occurred while adding the task.")],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const sharedTodoCompleteModalHandler = {
  name: 'shared_todo_complete_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_complete`, 5, 30000);
      if (!allowed) {
        return interaction.reply({
          embeds: [errorEmbed('Rate Limited', 'You are completing tasks too quickly. Please wait and try again.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Invalid shared list ID.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Task ID must be a positive number.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "Shared list not found.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "You don't have access to this list.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(t => t.id === taskId);
      
      if (!task) {
        return interaction.reply({
          embeds: [errorEmbed("Error", "Task not found.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (task.completed) {
        return interaction.reply({
          embeds: [errorEmbed("Task Already Completed", `Task #${task.id} is already completed.`)],
          flags: MessageFlags.Ephemeral
        });
      }
      
      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();
      
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);
      
      return interaction.reply({
        embeds: [successEmbed("Task Completed", `Marked "${task.text}" as complete!`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo complete modal:', error);
      return interaction.reply({
        embeds: [errorEmbed("Error", "An error occurred while completing the task.")],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const sharedTodoRemoveModalHandler = {
  name: 'shared_todo_remove_modal',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_remove`, 5, 30000);
      if (!allowed) {
        return interaction.reply({
          embeds: [errorEmbed('Rate Limited', 'You are removing tasks too quickly. Please wait and try again.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Invalid shared list ID.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Task ID must be a positive number.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const listKey = `shared_todo_${listId}`;
      const listData = await getFromDb(listKey, null);

      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Shared list not found.')],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed('Error', "You don't have access to this list.")],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!Array.isArray(listData.tasks)) {
        listData.tasks = [];
      }

      const taskIndex = listData.tasks.findIndex(task => task.id === taskId);
      if (taskIndex === -1) {
        return interaction.reply({
          embeds: [errorEmbed('Error', 'Task not found.')],
          flags: MessageFlags.Ephemeral
        });
      }

      const [removedTask] = listData.tasks.splice(taskIndex, 1);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [successEmbed('Task Removed', `Removed "${removedTask.text}" from the shared list.`)],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Error in shared todo remove modal:', error);
      return interaction.reply({
        embeds: [errorEmbed('Error', 'An error occurred while removing the task.')],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

export default sharedTodoAddHandler;
export { sharedTodoCompleteHandler, sharedTodoRemoveHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler, sharedTodoRemoveModalHandler };



