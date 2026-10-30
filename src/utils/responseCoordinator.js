// responseCoordinator.js — single respond-once gate for prefix and slash commands

import { logger } from './logger.js';
import { twoWordCommandAliases } from '../config/commands/commandAliases.js';
import { usageHelp } from '../config/commands/usageHelp.js';

function getCommandJson(commandData) {
  return commandData?.toJSON ? commandData.toJSON() : commandData;
}

const USAGE_EMBED_COLOR = 0xe67e22;
const REPLY_TARGET_HINT = '💡 ممكن تعمل ريبلاي على رسالة العضو بدل المنشن';
const OPTION_TYPE_LABELS = { 6: '@العضو', 7: '#الروم', 8: '@الرول', 9: '@العضو' };
const OPTION_NAME_LABELS = {
  reason: 'السبب',
  duration: 'المدة',
  amount: 'العدد',
  limit: 'العدد',
  message: 'الرسالة',
  note: 'الملاحظة',
  users: 'IDs',
  delete_days: 'أيام_المسح',
};

function optionPlaceholder(option) {
  const label = OPTION_TYPE_LABELS[option.type] || OPTION_NAME_LABELS[option.name] || option.name;
  return option.required ? label : `[${label}]`;
}

/**
 * Short usage line, e.g. `بان @العضو [السبب]` or `!todo add|list|remove`.
 * `commandLabel` is what the member typed (Arabic alias, with or without prefix).
 */
export function buildPrefixUsage(prefix, commandData, validation, commandLabel = null) {
  const commandJson = getCommandJson(commandData);
  const usageParts = [commandLabel || `${prefix}${commandJson.name}`];

  if (validation.subcommandGroupName) {
    usageParts.push(validation.subcommandGroupName);
  }

  if (validation.subcommandName) {
    usageParts.push(validation.subcommandName);
  } else if (!validation.subcommandGroupName && commandJson.options?.some((opt) => opt.type === 1 || opt.type === 2)) {
    usageParts.push(commandJson.options.filter((opt) => opt.type === 1 || opt.type === 2).map((opt) => opt.name).join('|'));
  }

  const help = usageHelp[commandJson.name];
  if (help?.args && !validation.subcommandName && !validation.subcommandGroupName) {
    usageParts.push(help.args);
  } else {
    for (const option of validation.optionDefs || []) {
      usageParts.push(optionPlaceholder(option));
    }
  }

  return usageParts.filter(Boolean).join(' ');
}

/** The command as the member typed it: `تايم`, `!ban`, or both words of `ماس بان`. */
export function typedCommandLabel(content) {
  const words = String(content || '').trim().split(/\s+/u);
  if (!words[0]) return null;
  return twoWordCommandAliases[`${words[0]} ${words[1] || ''}`] ? `${words[0]} ${words[1]}` : words[0];
}

/** A member can be picked by replying to their message when the command's first option is a user. */
function takesReplyTarget(commandJson) {
  return commandJson.options?.[0]?.type === 6;
}

/**
 * Usage embed: title, what the command does, the usage line, then any extra fields from `usageHelp`.
 */
export function buildPrefixUsageEmbed(prefix, commandData, validation, commandLabel = null) {
  const commandJson = getCommandJson(commandData);
  const help = usageHelp[commandJson.name] || {};
  const label = prefix && commandLabel?.startsWith(prefix) ? commandLabel.slice(prefix.length) : commandLabel || commandJson.name;
  const subcommand = commandJson.options?.find((opt) => opt.name === validation.subcommandName);
  const description = help.description || subcommand?.description || commandJson.description;

  return {
    color: USAGE_EMBED_COLOR,
    title: `${help.emoji || '📌'} ${help.title || `أمر ${label}`}`,
    ...(description ? { description } : {}),
    fields: [
      { name: '📌 الاستخدام', value: `\`\`\`\n${buildPrefixUsage(prefix, commandData, validation, commandLabel)}\n\`\`\`` },
      ...(help.fields || []).map(([name, value]) => ({ name, value, inline: true })),
    ],
    ...(takesReplyTarget(commandJson) ? { footer: { text: REPLY_TARGET_HINT } } : {}),
  };
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

  async respondUsage(embed) {
    const result = await this.respond({ content: '', embeds: [embed], components: [], allowedMentions: { parse: [] } });
    this.markFinalized('usage');
    return result;
  }

  async respondUsageFromCommand(prefix, commandData, validation) {
    const typedCommand = typedCommandLabel(this.message?.content);
    return this.respondUsage(buildPrefixUsageEmbed(prefix, commandData, validation, typedCommand));
  }
}
