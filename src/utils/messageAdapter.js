// messageAdapter.js

import { mapArgumentsToOptions } from './prefixParser.js';
import { createEmbed } from './embeds.js';
import { handleInteractionError } from './errorHandler.js';
import { logger } from './logger.js';
import { InteractionHelper } from './interactionHelper.js';
import { SLASH_ONLY_COMMANDS } from '../config/commands/prefixRestrictions.js';
import { getCommandPrefix } from '../config/bot.js';
import { ResponseCoordinator, buildPrefixUsage } from './responseCoordinator.js';
import { enforceDefaultCommandPermissions } from './permissionGuard.js';
import { scheduleNoPermissionDelete } from './noPermissionReply.js';

export { buildPrefixUsage };

function getCommandJson(commandData) {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

export function resolveSlashAccessKey(interaction) {
  const subcommandGroup = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand(false);

  if (subcommandGroup && subcommand) {
    return `${interaction.commandName} ${subcommandGroup} ${subcommand}`;
  }

  if (subcommand) {
    return `${interaction.commandName} ${subcommand}`;
  }

  return interaction.commandName;
}

export function resolvePrefixAccessKey(commandData, args) {
  const options = mapArgumentsToOptions(args, commandData);
  const subcommand = options.getSubcommand();
  const subcommandGroup = options.getSubcommandGroup();
  const commandName = getCommandJson(commandData)?.name;

  if (!commandName) {
    return null;
  }

  if (subcommandGroup && subcommand) {
    return `${commandName} ${subcommandGroup} ${subcommand}`;
  }

  if (subcommand) {
    return `${commandName} ${subcommand}`;
  }

  return commandName;
}

export function createMockInteraction(message, commandData, args) {
  const options = mapArgumentsToOptions(args, commandData);
  const commandStartTime = Date.now();

  const mockInteraction = {
    user: message.author,
    member: message.member,
    get memberPermissions() {
      return message.member?.permissions ?? null;
    },

    channel: message.channel,
    guild: message.guild,
    guildId: message.guild?.id,
    inGuild: () => Boolean(message.guild),
    inCachedGuild: () => Boolean(message.guild),
    isChatInputCommand: () => true,
    isModalSubmit: () => false,
    isRepliable: () => true,

    commandName: commandData?.name || null,
    commandId: message.id,
    id: message.id,

    options: {
      get: (name) => options.get(name),
      getString: (name) => options.getString(name),
      getUser: (name) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        const cachedMember = message.guild.members.cache.get(id);
        if (cachedMember) {
          return cachedMember.user;
        }

        const cachedUser = message.client?.users?.cache?.get(id);
        if (cachedUser) {
          return cachedUser;
        }

        return {
          id,
          username: 'Unknown',
          bot: false,
          tag: 'Unknown#0000',
        };
      },
      getMember: (name) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        return message.guild.members.cache.get(id) ?? null;
      },
      getChannel: (name) => {
        const channelId = options.getString(name);
        if (!channelId || !message.guild) return null;

        const mentionMatch = channelId.match(/<#(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : channelId;

        // Slash options resolve synchronously; guild channels are always cached with the Guilds intent.
        return message.guild.channels.cache.get(id) ?? null;
      },
      getRole: (name) => {
        const roleId = options.getString(name);
        if (!roleId || !message.guild) return null;

        const mentionMatch = roleId.match(/<@&(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : roleId;

        return message.guild.roles.cache.get(id) ?? null;
      },
      getInteger: (name) => options.getInteger(name),
      getNumber: (name) => {
        const value = options.getString(name);
        const parsed = value == null ? NaN : Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      },
      getBoolean: (name) => options.getBoolean(name),
      getSubcommand: () => options.getSubcommand(),
      getSubcommandGroup: () => options.getSubcommandGroup(),
      validateRequired: () => options.validateRequired(),
      _hoistedOptions: args.map((arg, index) => ({
        name: commandData?.options?.[index]?.name || `arg${index}`,
        value: arg,
        type: 3,
      })),
    },

    createdTimestamp: message.createdTimestamp,
    createdAt: message.createdAt,
    _commandStartTime: commandStartTime,
    _isPrefixCommand: true,
    _sourceMessage: message,

    client: message.client,

    deferred: false,
    replied: false,
    _replyMessage: null,

    deleteReply: async () => {
      const replyMessage = coordinator.getReplyMessage();
      if (replyMessage?.deletable) {
        return replyMessage.delete();
      }
      if (message.deletable) {
        return message.delete();
      }
    },

    fetchReply: async () => coordinator.getReplyMessage() || message,

    ephemeral: false,
    webhook: null,
  };

  const coordinator = ResponseCoordinator.attach(mockInteraction, { message });

  mockInteraction.reply = (payload) => coordinator.respond(payload);
  mockInteraction.editReply = (payload) => coordinator.edit(payload);
  mockInteraction.followUp = (payload) => coordinator.followUp(payload);
  mockInteraction.deferReply = () => coordinator.deferLocal();

  InteractionHelper.patchInteractionResponses(mockInteraction);

  return mockInteraction;
}

export function supportsPrefixExecution(command) {
  if (command.prefixOnly === false || command.slashOnly === true) {
    return false;
  }

  const commandName = command.data?.name?.toLowerCase();
  if (commandName && SLASH_ONLY_COMMANDS.has(commandName)) {
    return false;
  }

  if (command.prefixExecute) {
    return true;
  }

  return !!command.execute;
}

/**
 * Slash commands receive resolved members; prefix commands only get mentions/IDs.
 * Fetch mentioned members first so getUser/getMember work for members that are not cached yet.
 */
async function cacheMentionedMembers(message, args) {
  if (!message.guild?.members?.fetch) return;
  const ids = new Set();
  for (const arg of args) {
    const match = String(arg).match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/u);
    if (match) ids.add(match[1] || match[2]);
  }
  await Promise.all([...ids]
    .filter((id) => !message.guild.members.cache.has(id))
    .map(async (id) => {
      const member = await message.guild.members.fetch(id).catch(() => null);
      // Users outside the server (e.g. for unban) are still resolved so replies show their tag.
      if (!member) await message.client?.users?.fetch?.(id).catch(() => null);
    }));
}

export async function executePrefixCommand(command, message, args, client, prefixOverride = null, guildConfig = null) {
  await cacheMentionedMembers(message, args);
  const mockInteraction = createMockInteraction(message, command.data, args);
  const coordinator = mockInteraction._responseCoordinator;
  const prefix = prefixOverride || getCommandPrefix();

  try {
    const permissionAllowed = await enforceDefaultCommandPermissions(mockInteraction, command, {
      source: 'messageAdapter.executePrefixCommand',
      guildConfig,
    });
    if (!permissionAllowed) {
      return;
    }

    const validation = mockInteraction.options.validateRequired();
    if (!validation.valid) {
      await coordinator.respondUsageFromCommand(prefix, command.data, validation);
      return;
    }

    if (command.prefixExecute) {
      await command.prefixExecute(mockInteraction, guildConfig, client);
    } else {
      await command.execute(mockInteraction, guildConfig, client);
    }
  } catch (error) {
    await handleInteractionError(mockInteraction, error, {
      type: 'prefix_command',
      command: command.data?.name,
      source: 'messageAdapter.executePrefixCommand',
    });
  } finally {
    scheduleNoPermissionDelete(coordinator.getReplyMessage());
  }
}
