import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { successEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

import { replyUserError, ErrorTypes } from '../utils/errorHandler.js';
import type { Guild, ModalSubmitInteraction } from 'discord.js';
import type { SharedTodoList, SharedTodoTask } from '../commands/Utility/todo.js';
import type { ButtonHandler, ModalHandler } from '../types/index.js';

/** Shared task as written by the complete modal (adds completedAt). */
interface StoredSharedTodoTask extends SharedTodoTask {
  completedAt?: string;
}

interface StoredSharedTodoList extends SharedTodoList {
  tasks: StoredSharedTodoTask[];
}

function buildSharedTodoViewPayload(listData: StoredSharedTodoList, listId: string, guild: Guild | null) {
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
          `👑 **Besitzer:** ${ownerName}\n` +
          `👥 **Mitglieder:** ${memberList}\n\n` +
          '*Diese Liste ist noch leer. Füg mit dem Button „Aufgabe hinzufügen“ Aufgaben hinzu!*',
          `Geteilte Liste (ID: \`${listId}\`)`
        )
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`shared_todo_add_${listId}`)
            .setLabel('Aufgabe hinzufügen')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shared_todo_complete_${listId}`)
            .setLabel('Aufgabe erledigen')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`shared_todo_remove_${listId}`)
            .setLabel('Aufgabe entfernen')
            .setStyle(ButtonStyle.Danger)
        )
      ]
    };
  }

  const taskList = tasks
    .map(task =>
      `${task.completed ? '✅' : '📝'} #${task.id} ${task.text} ` +
      `\`[${new Date(task.createdAt).toLocaleDateString()}]` +
      (task.completed ? ` • Erledigt von <@${task.completedBy}>` : '') + '`'
    )
    .join('\n');

  return {
    embeds: [
      successEmbed(
        `📋 **${listData.name}**\n\n` +
        `👑 **Besitzer:** ${ownerName}\n` +
        `👥 **Mitglieder:** ${memberList}\n\n` +
        `**Aufgaben:**\n${taskList}`,
        `Geteilte Liste (ID: \`${listId}\`)`
      )
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`shared_todo_add_${listId}`)
          .setLabel('Aufgabe hinzufügen')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`shared_todo_complete_${listId}`)
          .setLabel('Aufgabe erledigen')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`shared_todo_remove_${listId}`)
          .setLabel('Aufgabe entfernen')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

async function refreshSharedTodoMessage(interaction: ModalSubmitInteraction, listId: string, messageId: string | null): Promise<void> {
  if (!messageId || !interaction.channel) {
    return;
  }

  const listKey = `shared_todo_${listId}`;
  const listData = await getFromDb<StoredSharedTodoList>(listKey, null);
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
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

const sharedTodoAddHandler = {
  name: 'shared_todo_add',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültige ID der geteilten Liste.' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Aufgabe zur geteilten Liste hinzufügen');

    const taskInput = new TextInputBuilder()
      .setCustomId('task_text')
      .setLabel('Beschreibung der Aufgabe')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(taskInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
} satisfies ButtonHandler;

const sharedTodoCompleteHandler = {
  name: 'shared_todo_complete',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültige ID der geteilten Liste.' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Aufgabe in geteilter Liste erledigen');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('ID der zu erledigenden Aufgabe')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('z. B. 1, 2, 3');

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
} satisfies ButtonHandler;

const sharedTodoRemoveHandler = {
  name: 'shared_todo_remove',
  async execute(interaction, client, args) {
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültige ID der geteilten Liste.' });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_remove_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle('Aufgabe aus geteilter Liste entfernen');

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel('ID der zu entfernenden Aufgabe')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('z. B. 1, 2, 3');

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
} satisfies ButtonHandler;

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
        return await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Du fügst Aufgaben zu schnell hinzu. Warte kurz und versuch es erneut.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültige ID der geteilten Liste.' });
      }

      if (!taskText || taskText.trim().length === 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Der Aufgabentext darf nicht leer sein.' });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb<StoredSharedTodoList>(listKey, null);
      
      if (!listData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast keinen Zugriff auf diese Liste.' });
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
        embeds: [successEmbed("Aufgabe hinzugefügt", `„${taskText}“ wurde zur geteilten Liste hinzugefügt.`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo add modal:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Hinzufügen der Aufgabe ist ein Fehler aufgetreten.' });
    }
  }
} satisfies ModalHandler;

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
        return await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Du erledigst Aufgaben zu schnell. Warte kurz und versuch es erneut.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültige ID der geteilten Liste.' });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Aufgaben-ID muss eine positive Zahl sein.' });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb<StoredSharedTodoList>(listKey, null);
      
      if (!listData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast keinen Zugriff auf diese Liste.' });
      }

      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(t => t.id === taskId);
      
      if (!task) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Aufgabe nicht gefunden.' });
      }

      if (task.completed) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: `Aufgabe #${task.id} ist bereits erledigt.` });
      }
      
      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();
      
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);
      
      return interaction.reply({
        embeds: [successEmbed("Aufgabe erledigt", `„${task.text}“ wurde als erledigt markiert!`)],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo complete modal:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Erledigen der Aufgabe ist ein Fehler aufgetreten.' });
    }
  }
} satisfies ModalHandler;

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
        return await replyUserError(interaction, { type: ErrorTypes.RATE_LIMIT, message: 'Du entfernst Aufgaben zu schnell. Warte kurz und versuch es erneut.' });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Ungültige ID der geteilten Liste.' });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Aufgaben-ID muss eine positive Zahl sein.' });
      }

      const listKey = `shared_todo_${listId}`;
      const listData = await getFromDb<StoredSharedTodoList>(listKey, null);

      if (!listData) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Geteilte Liste nicht gefunden.' });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Du hast keinen Zugriff auf diese Liste.' });
      }

      if (!Array.isArray(listData.tasks)) {
        listData.tasks = [];
      }

      const taskIndex = listData.tasks.findIndex(task => task.id === taskId);
      if (taskIndex === -1) {
        return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Aufgabe nicht gefunden.' });
      }

      const [removedTask] = listData.tasks.splice(taskIndex, 1);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId);

      return interaction.reply({
        embeds: [successEmbed('Aufgabe entfernt', `„${removedTask.text}“ wurde aus der geteilten Liste entfernt.`)],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Error in shared todo remove modal:', error);
      return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Beim Entfernen der Aufgabe ist ein Fehler aufgetreten.' });
    }
  }
} satisfies ModalHandler;

export default sharedTodoAddHandler;
export { sharedTodoCompleteHandler, sharedTodoRemoveHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler, sharedTodoRemoveModalHandler };