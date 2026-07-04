// responseCoordinator.js — single respond-once gate for prefix and slash commands

import { buildUserErrorEmbed } from './embeds.js';
import { logger } from './logger.js';

function getCommandJson(commandData) {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

export function buildPrefixUsage(prefix, commandData, validation) {
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
  constructor(interaction, { message = null } = {}) {
    this.interaction = interaction;
    this.message = message;
    this._replyMessage = null;
    this._finalized = false;
    this._finalizedReason = null;
  }

  static attach(interaction, options = {}) {
    if (interaction._responseCoordinator) {
      return interaction._responseCoordinator;
    }

    const coordinator = new ResponseCoordinator(interaction, options);
    interaction._responseCoordinator = coordinator;
    return coordinator;
  }

  hasResponded() {
    return (
      this._finalized
      || !!this._replyMessage
      || !!this.interaction._replyMessage
      || this.interaction.replied
      || this.interaction.deferred
    );
  }

  isUsageFinalized() {
    return this._finalizedReason === 'usage';
  }

  markFinalized(reason) {
    this._finalized = true;
    this._finalizedReason = reason;
    this.interaction.replied = true;
  }

  getReplyMessage() {
    return this._replyMessage || this.interaction._replyMessage || null;
  }

  setReplyMessage(sentMessage) {
    this._replyMessage = sentMessage;
    this.interaction._replyMessage = sentMessage;
  }

  isPrefixInteraction() {
    return Boolean(this.interaction._isPrefixCommand || this.message?.channel);
  }

  async sendPrefixPayload(payload) {
    if (!this.message?.channel) {
      return null;
    }

    const sentMessage = await this.message.channel.send(payload);
    this.setReplyMessage(sentMessage);
    return sentMessage;
  }

  async deferLocal() {
    this.interaction.deferred = true;
    return true;
  }

  async respond(payload) {
    if (this.isUsageFinalized()) {
      return this.getReplyMessage();
    }

    const existing = this.getReplyMessage();
    if (existing) {
      return this.edit(payload);
    }

    this.interaction.replied = true;

    if (this.message?.channel) {
      const sentMessage = await this.message.channel.send(payload);
      this.setReplyMessage(sentMessage);
      return sentMessage;
    }

    if (this.interaction.deferred) {
      if (this.isPrefixInteraction()) {
        return this.sendPrefixPayload(payload);
      }
      await this.interaction.editReply(payload);
      return null;
    }

    if (this.interaction.replied) {
      if (this.message?.channel) {
        return this.message.channel.send(payload);
      }
      await this.interaction.followUp(payload);
      return null;
    }

    if (this.isPrefixInteraction()) {
      return this.sendPrefixPayload(payload);
    }

    await this.interaction.reply(payload);
    return null;
  }

  async edit(payload) {
    if (this.isUsageFinalized()) {
      return this.getReplyMessage();
    }

    const existing = this.getReplyMessage();
    if (existing) {
      try {
        return await existing.edit(payload);
      } catch (error) {
        logger.debug(`ResponseCoordinator edit failed: ${error.message}`);
        if (this.message?.channel) {
          const sentMessage = await this.message.channel.send(payload);
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
      await this.interaction.editReply(payload);
      return null;
    }

    return this.respond(payload);
  }

  async followUp(payload) {
    if (this.message?.channel) {
      return this.message.channel.send(payload);
    }

    return this.interaction.followUp(payload);
  }

  async respondUsage(usageLine) {
    const embed = buildUserErrorEmbed(
      'validation',
      `Usage\n\`${usageLine}\``,
      { titleOverride: 'Wrong Usage' }
    );

    const result = await this.respond({ embeds: [embed] });
    this.markFinalized('usage');
    return result;
  }

  async respondUsageFromCommand(prefix, commandData, validation) {
    const usageLine = buildPrefixUsage(prefix, commandData, validation);
    return this.respondUsage(usageLine);
  }
}
