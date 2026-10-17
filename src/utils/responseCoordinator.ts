// responseCoordinator.js — single respond-once gate for prefix and slash commands

import { buildUserErrorEmbed } from './embeds.js';
import { logger } from './logger.js';
import type {
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageCreateOptions,
  MessageEditOptions,
  MessagePayload,
  SendableChannels,
} from 'discord.js';
import type { PrefixCommandData, PrefixCommandJson, PrefixValidationResult } from './prefixParser.js';

/** Any payload the coordinator forwards unchanged to reply/editReply/followUp or channel.send. */
export type ResponsePayload = string | MessagePayload | InteractionReplyOptions | InteractionEditReplyOptions;

/**
 * Response methods typed with the shared payload. Method syntax keeps the parameter check
 * bivariant, so discord.js interactions (with their overloaded methods) fit this shape.
 */
export interface PayloadResponder {
  reply(payload: ResponsePayload): Promise<unknown>;
  editReply(payload: ResponsePayload): Promise<unknown>;
  followUp(payload: ResponsePayload): Promise<unknown>;
}

/** What the coordinator needs from an interaction: real interactions and the prefix mock both fit. */
export interface CoordinatedInteraction {
  deferred: boolean;
  replied: boolean;
  _replyMessage?: Message | null;
  _isPrefixCommand?: boolean;
  _responseCoordinator?: ResponseCoordinator;
  reply?(payload: ResponsePayload): Promise<unknown>;
  editReply?(payload: ResponsePayload): Promise<unknown>;
  followUp?(payload: ResponsePayload): Promise<unknown>;
}

export interface ResponseCoordinatorOptions {
  message?: Message | null;
}

export type PrefixUsageValidation = Pick<PrefixValidationResult, 'subcommandName' | 'subcommandGroupName' | 'optionDefs'>;

// Payloads are forwarded to channel.send / message.edit unchanged, exactly as the JS did.
function sendToChannel(message: Message, payload: ResponsePayload): Promise<Message> {
  // Prefix messages come from channels the bot can post in; discord.js types also include PartialGroupDMChannel.
  return (message.channel as SendableChannels).send(payload as string | MessagePayload | MessageCreateOptions);
}

function getCommandJson(commandData: PrefixCommandData): PrefixCommandJson {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

export function buildPrefixUsage(prefix: string, commandData: PrefixCommandData, validation: PrefixUsageValidation): string {
  const commandJson = getCommandJson(commandData);
  const usageParts = [`${prefix}${commandJson.name}`];

  if (validation.subcommandGroupName) {
    usageParts.push(validation.subcommandGroupName);
  }

  if (validation.subcommandName) {
    usageParts.push(validation.subcommandName);
  } else if (!validation.subcommandGroupName && commandJson.options?.some((opt) => opt.type === 1)) {
    usageParts.push('[subcommand]');
  }

  const optionDefs = validation.optionDefs || [];
  for (const option of optionDefs) {
    usageParts.push(`[${option.name}]`);
  }

  return usageParts.filter(Boolean).join(' ');
}

export class ResponseCoordinator {
  interaction: CoordinatedInteraction;
  message: Message | null;
  _replyMessage: Message | null;
  _finalized: boolean;
  _finalizedReason: string | null;

  constructor(interaction: CoordinatedInteraction, { message = null }: ResponseCoordinatorOptions = {}) {
    this.interaction = interaction;
    this.message = message;
    this._replyMessage = null;
    this._finalized = false;
    this._finalizedReason = null;
  }

  static attach(interaction: CoordinatedInteraction, options: ResponseCoordinatorOptions = {}): ResponseCoordinator {
    if (interaction._responseCoordinator) {
      return interaction._responseCoordinator;
    }

    const coordinator = new ResponseCoordinator(interaction, options);
    interaction._responseCoordinator = coordinator;
    return coordinator;
  }

  hasResponded(): boolean {
    return (
      this._finalized
      || !!this._replyMessage
      || !!this.interaction._replyMessage
      || this.interaction.replied
      || this.interaction.deferred
    );
  }

  isUsageFinalized(): boolean {
    return this._finalizedReason === 'usage';
  }

  markFinalized(reason: string): void {
    this._finalized = true;
    this._finalizedReason = reason;
    this.interaction.replied = true;
  }

  getReplyMessage(): Message | null {
    return this._replyMessage || this.interaction._replyMessage || null;
  }

  setReplyMessage(sentMessage: Message): void {
    this._replyMessage = sentMessage;
    this.interaction._replyMessage = sentMessage;
  }

  isPrefixInteraction(): boolean {
    return Boolean(this.interaction._isPrefixCommand || this.message?.channel);
  }

  async sendPrefixPayload(payload: ResponsePayload): Promise<Message | null> {
    if (!this.message?.channel) {
      return null;
    }

    const sentMessage = await sendToChannel(this.message, payload);
    this.setReplyMessage(sentMessage);
    return sentMessage;
  }

  async deferLocal(): Promise<boolean> {
    this.interaction.deferred = true;
    return true;
  }

  async respond(payload: ResponsePayload): Promise<Message | null> {
    if (this.isUsageFinalized()) {
      return this.getReplyMessage();
    }

    const existing = this.getReplyMessage();
    if (existing) {
      return this.edit(payload);
    }

    this.interaction.replied = true;

    if (this.message?.channel) {
      const sentMessage = await sendToChannel(this.message, payload);
      this.setReplyMessage(sentMessage);
      return sentMessage;
    }

    if (this.interaction.deferred) {
      if (this.isPrefixInteraction()) {
        return this.sendPrefixPayload(payload);
      }
      await this.interaction.editReply!(payload);
      return null;
    }

    if (this.interaction.replied) {
      if (this.message?.channel) {
        return sendToChannel(this.message, payload);
      }
      await this.interaction.followUp!(payload);
      return null;
    }

    if (this.isPrefixInteraction()) {
      return this.sendPrefixPayload(payload);
    }

    await this.interaction.reply!(payload);
    return null;
  }

  async edit(payload: ResponsePayload): Promise<Message | null> {
    if (this.isUsageFinalized()) {
      return this.getReplyMessage();
    }

    const existing = this.getReplyMessage();
    if (existing) {
      try {
        return await existing.edit(payload as string | MessagePayload | MessageEditOptions);
      } catch (error) {
        logger.debug(`ResponseCoordinator edit failed: ${(error as Error).message}`);
        if (this.message?.channel) {
          const sentMessage = await sendToChannel(this.message, payload);
          this.setReplyMessage(sentMessage);
          return sentMessage;
        }
        throw error;
      }
    }

    if (this.isPrefixInteraction()) {
      return this.sendPrefixPayload(payload);
    }

    if (this.interaction.deferred || this.interaction.replied) {
      await this.interaction.editReply!(payload);
      return null;
    }

    return this.respond(payload);
  }

  async followUp(payload: ResponsePayload): Promise<unknown> {
    if (this.message?.channel) {
      return sendToChannel(this.message, payload);
    }

    return this.interaction.followUp!(payload);
  }

  async respondUsage(usageLine: string): Promise<Message | null> {
    const embed = buildUserErrorEmbed(
      'validation',
      `Verwendung\n\`${usageLine}\``,
      { titleOverride: 'Falsche Verwendung' }
    );

    const result = await this.respond({ embeds: [embed] });
    this.markFinalized('usage');
    return result;
  }

  async respondUsageFromCommand(prefix: string, commandData: PrefixCommandData, validation: PrefixUsageValidation): Promise<Message | null> {
    const usageLine = buildPrefixUsage(prefix, commandData, validation);
    return this.respondUsage(usageLine);
  }
}
