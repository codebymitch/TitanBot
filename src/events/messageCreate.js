import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { handleArabicUtilityShortcuts } from '../utils/arabicUtilityShortcuts.js';
import { handleMessageDeleteShortcut } from '../utils/messageDeleteShortcut.js';
import { parseTypedCommand, mapArgumentsToOptions } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias, applyWordAliases } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { getCountingGameConfig, saveCountingGameConfig, isValidCountingMessage, recordCorrectCount } from '../services/countingGameService.js';
import { handleTrustedListCommand } from '../utils/trustedCommand.js';
import { handleArabicRoleShortcut, handleClearWarningsShortcut } from '../utils/arabicModerationShortcuts.js';
import { handlePurgeMessage } from '../services/moderation/channelPurgeService.js';
import { handleReportChannelMessage } from '../services/reportChannelService.js';
import { handleProtectedChannelMessage } from '../services/protectedChannelsService.js';
import { handleEveryoneMention } from '../services/everyoneMentionGuardService.js';
import { handleProofMessage, handleProofPinNotice } from '../services/moderation/proofMergeService.js';
import { handleChatFilter } from '../services/moderation/chatFilterService.js';
import { handleSpam, handleOwnerMentionSpam } from '../services/moderation/antiSpamService.js';
import { handleForeignInviteLink } from '../services/inviteLinkGuardService.js';
import { handleMediaMessage } from '../services/mediaRoleService.js';
import { handleImageOnlyChannelMessage } from '../services/imageOnlyChannelService.js';
import { handleGamesChannelMessage, isGamesOnlyFor, isGameCommandMessage } from '../services/games/gamesChannel.js';
import { handleGamesBotWin } from '../services/cc/gamesBotWins.js';
import { handleGamesBotOutsideChannel } from '../services/cc/gamesBotChannel.js';
import { handleStoreChannelMessage } from '../services/cc/storeChannel.js';
import { handleMessageXp } from '../services/leveling/messageXp.js';
import { countMessage } from '../services/leveling/chatCounter.js';
import { handleAfkMessage } from '../services/afkService.js';
import { handleSalam } from '../services/chat/salamReply.js';
import { handleQr } from '../services/chat/qrReply.js';
import { handleMentionGroupCommand } from '../services/mentionGroup.js';
import { handleStreakCommand, handleStreakMessage, isStreakChannel } from '../services/cc/streakService.js';
import { handleDangerCommand, handleDangerMessage, punishDanger, blockDangerCommand, DANGER_COMMAND_WORD } from '../services/moderation/dangerList.js';

const AFK_COMMAND = /^\s*[^\p{L}\p{N}\s]{0,3}(?:afk|افك|أفك)(?:\s|$)/iu;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      // Runs before the bot check so other bots cannot post in the protected board channels either.
      if (await handleProtectedChannelMessage(message)) return;
      if (await handleGamesChannelMessage(message, client)) return;
      // The store room only keeps store commands (and reposts its panel every few messages).
      if (await handleStoreChannelMessage(message, client)) return;
      // Games bots (Clover) only play in their channel; elsewhere their messages are deleted.
      if (await handleGamesBotOutsideChannel(message)) return;
      if (await handleProofPinNotice(message)) return;
      // Wins announced by the games bot (Clover) pay CC here.
      if (await handleGamesBotWin(message, client)) return;
      if (message.author.bot || !message.guild) return;
      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);

      // Danger list (`خطر @member`): @everyone/@here or an invite link from a listed member = a week of timeout.
      if (await handleDangerMessage(message)) return;
      if (await handleEveryoneMention(message)) return;
      // A moderator's proof in the moderation log channel is merged into their log message.
      if (await handleProofMessage(message)) return;
      // Insults and banned words (chatFilterService), then spam and repeated owner mentions (antiSpamService).
      if (await handleChatFilter(message)) {
        await punishDanger(message.guild, message.author.id, 'شتيمة أو كلام ممنوع');
        return;
      }
      if (await handleSpam(message)) {
        await punishDanger(message.guild, message.author.id, 'سبام');
        return;
      }
      if (await handleOwnerMentionSpam(message)) return;
      if (await handleForeignInviteLink(message)) return;
      if (await handleImageOnlyChannelMessage(message)) return;
      // The streak room takes everyone's daily picture, so the media role guard skips it.
      if (!isStreakChannel(message.channelId) && await handleMediaMessage(message)) return;
      if (await handleReportChannelMessage(message, { isCommand: (msg) => isBotCommand(msg, client) })) return;
      // Chat XP (runs in the background; the cooldown keeps it from being farmed with commands or spam).
      handleMessageXp(message, client);
      countMessage(client, message.guild.id, message.author.id);
      // Daily streak (our server only): a picture or GIF in the streak room pays the day's bonus.
      handleStreakMessage(message);
      // Clears the author's AFK (unless this is the afk command itself) and announces AFK members they mention.
      await handleAfkMessage(message, client, { isAfkCommand: AFK_COMMAND.test(message.content || '') });
      // In the games channel only game commands run (the rest there is game answers).
      const gamesOnly = isGamesOnlyFor(message);
      // "السلام عليكم" gets "عليكم السلام" (our server only); the message still goes on to the commands.
      if (!gamesOnly) await handleSalam(message);
      // "qr" gets the QR code of our guns.lol page (our server only).
      if (!gamesOnly && await handleQr(message)) return;
      if (!gamesOnly && await handleArabicUtilityShortcuts(message)) return;
      if (!gamesOnly && await handleMessageDeleteShortcut(message)) return;
      if (await handleCountingGame(message, client)) return;
      await handlePrefixCommand(message, client, gamesOnly);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

// Commands also work without the prefix, but only as the first word of the message
// (`تايم @member 5m`). A command word in the middle of a sentence is ignored.
const USER_ARG = /^(?:<@!?\d{17,20}>|\d{17,20})$/u;

// Replying to someone's message makes them the target: (reply) `تايم 5m سبام` = `تايم @member 5m سبام`.
async function applyReplyTarget(message, commandData, args) {
  if (!message.reference?.messageId || USER_ARG.test(args[0] || '')) return args;
  const firstOption = (commandData?.toJSON ? commandData.toJSON() : commandData)?.options?.[0];
  if (firstOption?.type !== 6) return args;
  const referenced = await message.fetchReference().catch(() => null);
  if (!referenced?.author || referenced.author.bot) return args;
  return [referenced.author.id, ...args];
}

/** Whether the message would run one of the bot's commands (same parsing as handlePrefixCommand). */
async function isBotCommand(message, client) {
  const guildConfig = await getGuildConfig(client, message.guild.id);
  const parsed = parseTypedCommand(message.content, guildConfig?.prefix || getCommandPrefix());
  if (!parsed) return false;
  const typedCommand = parsed.commandName.toLowerCase();
  if (['trusted', 'purge', DANGER_COMMAND_WORD, 'منشن'].includes(typedCommand)) return true;
  const aliased = applyWordAliases(typedCommand, parsed.args, parsed.prefixed);
  return Boolean(aliased && client.commands.get(resolveCommandAlias(aliased.commandName)));
}

async function handlePrefixCommand(message, client, gamesOnly = false) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    if (gamesOnly && !isGameCommandMessage(message.content, [prefix])) return;
    const parsed = parseTypedCommand(message.content, prefix);
    // `منشن` group (our server): runs before the role shortcuts so `شيل منشن @x` isn't "remove role منشن".
    if (parsed && await handleMentionGroupCommand(message, parsed.commandName, parsed.args)) return;
    if (parsed && await handleStreakCommand(message, parsed.commandName, parsed.args)) return;
    if (await handleArabicRoleShortcut(message, [prefix, getCommandPrefix()])) return;
    if (!parsed) return;

    let { commandName, args } = parsed;
    if (commandName.toLowerCase() === 'trusted') {
      if (args.length) {
        await message.channel.send(`⚠️ ${prefix}trusted`).catch(() => {});
      } else {
        await handleTrustedListCommand(message, client);
      }
      return;
    }

    const typedCommand = commandName.toLowerCase();
    // `purge` wipes the whole channel: owner only, confirmed with a button (in our server `purge 50 تأكيد` skips the button). `clear`/`مسح`/`م` delete N messages.
    if (typedCommand === 'purge') {
      await handlePurgeMessage(message, args);
      return;
    }
    if (typedCommand === DANGER_COMMAND_WORD && await handleDangerCommand(message, args)) return;
    if (typedCommand === 'مسح' && args[0] === 'تحذيرات') {
      await handleClearWarningsShortcut(message, args.slice(1));
      return;
    }
    const aliased = applyWordAliases(typedCommand, args, parsed.prefixed);
    if (!aliased) return;
    ({ commandName, args } = aliased);

    const musicPrefixShortcut = commandName.toLowerCase();
    if (new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']).has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    const resolvedCommandName = resolveCommandAlias(commandName);
    const command = client.commands.get(resolvedCommandName);
    if (!command) return;
    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send('🛠️ Maintenance Mode').catch(() => {});
      return;
    }
    if (!isCommandCategoryEnabled(command.category)) return;
    if (await blockDangerCommand(message.guild, message.author.id, resolvedCommandName)) {
      await message.channel.send({ content: `🚫 <@${message.author.id}> انت في قائمة الخطر.`, allowedMentions: { parse: [] } }).catch(() => {});
      return;
    }

    args = await applyReplyTarget(message, command.data, args);
    if (typeof command.normalizePrefixArgs === 'function') args = command.normalizePrefixArgs(args);

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (restriction.blocked || !supportsPrefixExecution(command)) return;
    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) return;

    // Wrong usage (e.g. `تايم الغداء`) only shows the permission/usage reply and must not start a cooldown.
    if (!mapArgumentsToOptions(args, command.data).validateRequired().valid) {
      await executePrefixCommand(command, message, args, client, prefix, guildConfig);
      return;
    }

    const abuseProtection = await enforceAbuseProtection({ guildId: message.guild.id, user: message.author }, command, resolvedCommandName);
    if (!abuseProtection.allowed) {
      await message.channel.send(`⏱️ Wait ${formatCooldownDuration(abuseProtection.remainingMs)}`).catch(() => {});
      return;
    }
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
    await message.channel.send({ content: `❌ ${error.userMessage || error.message || 'Something went wrong'}`, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) return false;
    const validCount = isValidCountingMessage(message.content.trim(), config);
    if (!validCount || message.author.id === config.lastUserId) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, { ...config, nextNumber: 1, lastUserId: null, currentStreak: 0 });
      await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      return true;
    }
    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}
