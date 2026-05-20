import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../utils/embeds.js';
import { getFromDb, setInDb } from '../utils/database.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/guildConfig.js';
import { t, pickLanguage } from '../services/i18n.js';

async function getLang(interaction, client) {
  try {
    const config = await getGuildConfig(client, interaction.guildId);
    return pickLanguage(config, interaction.guild);
  } catch {
    return 'es';
  }
}

function buildSharedTodoViewPayload(listData, listId, guild, lang) {
  const memberList = (listData.members || []).map(memberId => {
    const member = guild?.members?.cache?.get(memberId);
    return member ? member.user.username : `<@${memberId}>`;
  }).join(', ');

  const owner = guild?.members?.cache?.get(listData.creatorId);
  const ownerName = owner ? owner.user.username : `<@${listData.creatorId}>`;

  const tasks = Array.isArray(listData.tasks) ? listData.tasks : [];
  const idLabel = t(lang, 'wolf.cmd.utility.todo.shareViewIdLabel', { id: listId });

  if (tasks.length === 0) {
    return {
      embeds: [
        successEmbed(
          t(lang, 'wolf.cmd.utility.todo.shareViewEmptyBody', { name: listData.name, owner: ownerName, members: memberList }),
          idLabel
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`shared_todo_add_${listId}`)
            .setLabel(t(lang, 'wolf.cmd.utility.todo.btnAddTask'))
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`shared_todo_complete_${listId}`)
            .setLabel(t(lang, 'wolf.cmd.utility.todo.btnCompleteTask'))
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`shared_todo_remove_${listId}`)
            .setLabel(t(lang, 'wolf.cmd.utility.todo.btnRemoveTask'))
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
        t(lang, 'wolf.cmd.utility.todo.shareViewBody', { name: listData.name, owner: ownerName, members: memberList, tasks: taskList }),
        idLabel
      )
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`shared_todo_add_${listId}`)
          .setLabel(t(lang, 'wolf.cmd.utility.todo.btnAddTask'))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`shared_todo_complete_${listId}`)
          .setLabel(t(lang, 'wolf.cmd.utility.todo.btnCompleteTask'))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`shared_todo_remove_${listId}`)
          .setLabel(t(lang, 'wolf.cmd.utility.todo.btnRemoveTask'))
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

async function refreshSharedTodoMessage(interaction, listId, messageId, lang) {
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

    const updatedPayload = buildSharedTodoViewPayload(listData, listId, interaction.guild, lang);
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
    const lang = await getLang(interaction, client);
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await interaction.reply({
        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidListId'))],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_add_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle(t(lang, 'wolf.cmd.utility.todo.modalAddTitle'));

    const taskInput = new TextInputBuilder()
      .setCustomId('task_text')
      .setLabel(t(lang, 'wolf.cmd.utility.todo.modalAddLabel'))
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
    const lang = await getLang(interaction, client);
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await interaction.reply({
        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidListId'))],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_complete_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle(t(lang, 'wolf.cmd.utility.todo.modalCompleteTitle'));

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel(t(lang, 'wolf.cmd.utility.todo.modalCompleteLabel'))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder(t(lang, 'wolf.cmd.utility.todo.modalCompletePlaceholder'));

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoRemoveHandler = {
  name: 'shared_todo_remove',
  async execute(interaction, client, args) {
    const lang = await getLang(interaction, client);
    const listId = args[0];
    const sourceMessageId = interaction.message?.id;

    if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
      await interaction.reply({
        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidListId'))],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`shared_todo_remove_modal:${listId}:${sourceMessageId || ''}`)
      .setTitle(t(lang, 'wolf.cmd.utility.todo.modalRemoveTitle'));

    const taskIdInput = new TextInputBuilder()
      .setCustomId('task_id')
      .setLabel(t(lang, 'wolf.cmd.utility.todo.modalRemoveLabel'))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder(t(lang, 'wolf.cmd.utility.todo.modalRemovePlaceholder'));

    const actionRow = new ActionRowBuilder().addComponents(taskIdInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }
};

const sharedTodoAddModalHandler = {
  name: 'shared_todo_add_modal',
  async execute(interaction, client, args) {
    const lang = await getLang(interaction, client);
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskText = interaction.fields.getTextInputValue('task_text');
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_add`, 5, 30000);
      if (!allowed) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.rateLimitedTitle'), t(lang, 'wolf.cmd.utility.todo.rateLimitedAddDesc'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidListId'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!taskText || taskText.trim().length === 0) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskTextEmpty'))],
          flags: MessageFlags.Ephemeral
        });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNoAccess'))],
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

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId, lang);

      return interaction.reply({
        embeds: [successEmbed(
          t(lang, 'wolf.cmd.utility.todo.shareTaskAddedTitle'),
          t(lang, 'wolf.cmd.utility.todo.shareTaskAddedDesc', { task: taskText, name: listData.name })
        )],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo add modal:', error);
      return interaction.reply({
        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.errGeneric'))],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const sharedTodoCompleteModalHandler = {
  name: 'shared_todo_complete_modal',
  async execute(interaction, client, args) {
    const lang = await getLang(interaction, client);
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_complete`, 5, 30000);
      if (!allowed) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.rateLimitedTitle'), t(lang, 'wolf.cmd.utility.todo.rateLimitedCompleteDesc'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidListId'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskIdPositive'))],
          flags: MessageFlags.Ephemeral
        });
      }

      const listKey = `shared_todo_${listId}`;
      let listData = await getFromDb(listKey, null);
      
      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNoAccess'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.tasks) listData.tasks = [];

      const task = listData.tasks.find(tk => tk.id === taskId);
      
      if (!task) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskNotFound'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (task.completed) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskAlreadyCompleted', { id: task.id }))],
          flags: MessageFlags.Ephemeral
        });
      }
      
      task.completed = true;
      task.completedBy = userId;
      task.completedAt = new Date().toISOString();
      
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId, lang);
      
      return interaction.reply({
        embeds: [successEmbed(
          t(lang, 'wolf.cmd.utility.todo.completeTitle'),
          t(lang, 'wolf.cmd.utility.todo.completeDesc', { task: task.text })
        )],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      logger.error('Error in shared todo complete modal:', error);
      return interaction.reply({
        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.errGeneric'))],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const sharedTodoRemoveModalHandler = {
  name: 'shared_todo_remove_modal',
  async execute(interaction, client, args) {
    const lang = await getLang(interaction, client);
    const listId = args[0];
    const sourceMessageId = args[1] || null;
    const taskId = parseInt(interaction.fields.getTextInputValue('task_id'), 10);
    const userId = interaction.user.id;

    try {
      const allowed = await checkRateLimit(`${userId}:shared_todo_remove`, 5, 30000);
      if (!allowed) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.rateLimitedTitle'), t(lang, 'wolf.cmd.utility.todo.rateLimitedRemoveDesc'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listId || !/^[a-zA-Z0-9_-]{1,64}$/.test(listId)) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.invalidListId'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!Number.isInteger(taskId) || taskId <= 0) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskIdPositive'))],
          flags: MessageFlags.Ephemeral
        });
      }

      const listKey = `shared_todo_${listId}`;
      const listData = await getFromDb(listKey, null);

      if (!listData) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNotFound'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!listData.members || !listData.members.includes(userId)) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.shareNoAccess'))],
          flags: MessageFlags.Ephemeral
        });
      }

      if (!Array.isArray(listData.tasks)) {
        listData.tasks = [];
      }

      const taskIndex = listData.tasks.findIndex(task => task.id === taskId);
      if (taskIndex === -1) {
        return interaction.reply({
          embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.taskNotFound'))],
          flags: MessageFlags.Ephemeral
        });
      }

      const [removedTask] = listData.tasks.splice(taskIndex, 1);
      await setInDb(listKey, listData);

      await refreshSharedTodoMessage(interaction, listId, sourceMessageId, lang);

      return interaction.reply({
        embeds: [successEmbed(
          t(lang, 'wolf.cmd.utility.todo.shareTaskRemovedTitle'),
          t(lang, 'wolf.cmd.utility.todo.shareTaskRemovedDesc', { task: removedTask.text, name: listData.name })
        )],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      logger.error('Error in shared todo remove modal:', error);
      return interaction.reply({
        embeds: [errorEmbed(t(lang, 'wolf.cmd.utility.todo.errorTitle'), t(lang, 'wolf.cmd.utility.todo.errGeneric'))],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

export default sharedTodoAddHandler;
export { sharedTodoCompleteHandler, sharedTodoRemoveHandler, sharedTodoAddModalHandler, sharedTodoCompleteModalHandler, sharedTodoRemoveModalHandler };
