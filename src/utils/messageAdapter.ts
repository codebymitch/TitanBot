// messageAdapter.js

import type {
  ChatInputCommandInteraction,
  Guild,
  GuildBasedChannel,
  GuildMember,
  Message,
  PermissionsBitField,
  Role,
  User,
} from 'discord.js';
import { mapArgumentsToOptions } from './prefixParser.js';
import type { PrefixCommandData, PrefixCommandJson, PrefixValidationResult } from './prefixParser.js';
import type { Command, GuildConfig, NexoClient } from '../types/index.js';
import { createEmbed } from './embeds.js';
import { handleInteractionError } from './errorHandler.js';
import { logger } from './logger.js';
import { InteractionHelper } from './interactionHelper.js';
import { SLASH_ONLY_COMMANDS } from '../config/commands/prefixRestrictions.js';
import { getCommandPrefix } from '../config/bot.js';
import { ResponseCoordinator, buildPrefixUsage } from './responseCoordinator.js';
import type { ResponsePayload } from './responseCoordinator.js';
import { enforceDefaultCommandPermissions } from './permissionGuard.js';

export { buildPrefixUsage };

/** Placeholder returned by getUser when the mentioned user is not cached. */
interface UncachedUserStub {
  id: string;
  username: string;
  bot: boolean;
  tag: string;
}

/** Option accessors of the prefix mock, mirroring CommandInteractionOptionResolver. */
export interface PrefixMockOptions {
  get(name: string): string | null;
  getString(name: string): string | null;
  getUser(name: string): User | UncachedUserStub | null;
  getMember(name: string): GuildMember | null;
  getChannel(name: string): Promise<GuildBasedChannel | null> | null;
  getRole(name: string): Promise<Role | null> | null;
  getInteger(name: string): number | null;
  getBoolean(name: string): boolean;
  getSubcommand(): string | null;
  getSubcommandGroup(): string | null;
  validateRequired(): PrefixValidationResult;
  _hoistedOptions: Array<{ name: string; value: string; type: number }>;
}

/** Interaction-shaped object built from a prefix message; handed to commands as a ChatInputCommandInteraction. */
export interface PrefixMockInteraction {
  user: User;
  member: GuildMember | null;
  readonly memberPermissions: Readonly<PermissionsBitField> | null;
  channel: Message['channel'];
  guild: Guild | null;
  guildId: string | undefined;
  commandName: string | null;
  commandId: string;
  id: string;
  options: PrefixMockOptions;
  createdTimestamp: number;
  createdAt: Date;
  _commandStartTime: number;
  _isPrefixCommand: true;
  client: NexoClient;
  deferred: boolean;
  replied: boolean;
  _replyMessage: Message | null;
  deleteReply(): Promise<Message | undefined>;
  fetchReply(): Promise<Message>;
  ephemeral: boolean;
  webhook: null;
  reply?(payload: ResponsePayload): Promise<unknown>;
  editReply?(payload: ResponsePayload): Promise<unknown>;
  followUp?(payload: ResponsePayload): Promise<unknown>;
  deferReply?(): Promise<unknown>;
  /** Set by ResponseCoordinator.attach. */
  _responseCoordinator?: ResponseCoordinator;
}

function getCommandJson(commandData: PrefixCommandData | null | undefined): PrefixCommandJson | null | undefined {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

export function resolveSlashAccessKey(interaction: ChatInputCommandInteraction): string {
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

export function resolvePrefixAccessKey(commandData: PrefixCommandData, args: string[]): string | null {
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

export function createMockInteraction(
  message: Message,
  commandData: PrefixCommandData,
  args: string[]
): PrefixMockInteraction {
  const options = mapArgumentsToOptions(args, commandData);
  const commandStartTime = Date.now();

  const mockInteraction: PrefixMockInteraction = {
    user: message.author,
    member: message.member,
    get memberPermissions() {
      return message.member?.permissions ?? null;
    },

    channel: message.channel,
    guild: message.guild,
    guildId: message.guild?.id,

    commandName: commandData?.name || null,
    commandId: message.id,
    id: message.id,

    options: {
      get: (name: string) => options.get(name),
      getString: (name: string) => options.getString(name),
      getUser: (name: string) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        const cachedMember = message.guild.members.cache.get(id);
        if (cachedMember) {
          return cachedMember.user;
        }

        return {
          id,
          username: 'Unbekannt',
          bot: false,
          tag: 'Unbekannt#0000',
        };
      },
      getMember: (name: string) => {
        const userId = options.getUser(name);
        if (!userId || !message.guild) return null;

        const mentionMatch = userId.match(/<@!?(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : userId;

        return message.guild.members.cache.get(id) ?? null;
      },
      getChannel: (name: string) => {
        const channelId = options.getString(name);
        if (!channelId || !message.guild) return null;

        const mentionMatch = channelId.match(/<#(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : channelId;

        return message.guild.channels.fetch(id).catch(() => null);
      },
      getRole: (name: string) => {
        const roleId = options.getString(name);
        if (!roleId || !message.guild) return null;

        const mentionMatch = roleId.match(/<@&(\d+)>/);
        const id = mentionMatch ? mentionMatch[1] : roleId;

        return message.guild.roles.fetch(id).catch(() => null);
      },
      getInteger: (name: string) => options.getInteger(name),
      getBoolean: (name: string) => options.getBoolean(name),
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

export function supportsPrefixExecution(command: Command): boolean {
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

export async function executePrefixCommand(
  command: Command,
  message: Message,
  args: string[],
  client: NexoClient,
  prefixOverride: string | null = null,
  guildConfig: GuildConfig | null = null
): Promise<void> {
  const mockInteraction = createMockInteraction(message, command.data, args);
  // Commands, permission checks and error handling expect a ChatInputCommandInteraction;
  // the prefix mock implements the subset they use (see PrefixMockInteraction).
  const interaction = mockInteraction as unknown as ChatInputCommandInteraction;
  // Always set: createMockInteraction calls ResponseCoordinator.attach.
  const coordinator = mockInteraction._responseCoordinator!;
  const prefix = prefixOverride || getCommandPrefix();

  try {
    const permissionAllowed = await enforceDefaultCommandPermissions(interaction, command, {
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
      await command.prefixExecute(interaction, guildConfig, client);
    } else {
      await command.execute(interaction, guildConfig, client);
    }
  } catch (error) {
    await handleInteractionError(interaction, error, {
      type: 'prefix_command',
      command: command.data?.name,
      source: 'messageAdapter.executePrefixCommand',
    });
  }
}
