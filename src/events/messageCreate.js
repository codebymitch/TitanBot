import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import {
  getCountingGameConfig,
  saveCountingGameConfig,
  isValidCountingMessage,
  recordCorrectCount,
} from '../services/countingGameService.js';
import { handleGuess as handleTebakGambarGuess } from '../services/tebakGambarService.js';
import { handleStickyMessage } from '../services/stickyService.js';
import { handleAutoReaction } from '../services/autoReactionService.js';
import StreakService from '../services/streakService.js';
import { trackChatMessage } from '../services/chatLeaderboardService.js';
import {
  isAiConfigured,
  getCooldownRemaining,
  markCooldown,
  enqueue,
  generateReply,
  getAiErrorMessage,
  splitMessage,
} from '../services/aiChatService.js';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (!message.guild) return;

      // Sticky harus di-repost ke bawah untuk SEMUA pesan (termasuk bot lain),
      // tapi skip pesan dari bot kita sendiri supaya tidak loop.
      // handleStickyMessage juga punya guard internal untuk memastikan tidak loop.
      if (message.author?.id && message.author.id !== client.user?.id) {
        await handleStickyMessage(message, client);
      }

      if (message.author?.bot) return;

      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);
      trackChatMessage(message);

      // AI Auto Chat: balas otomatis, tapi HANYA di channel AI yang di-set.
      const aiProcessed = await handleAiAutoChat(message, client);
      if (aiProcessed) {
        return;
      }

      const countingProcessed = await handleCountingGame(message, client);
      if (countingProcessed) {
        return;
      }

      // Tebak gambar: pesan chat di channel permainan dipakai sebagai jawaban.
      // Kalau tebakannya benar, ronde ditutup dan pesan tidak diproses lebih lanjut.
      const tebakGambarProcessed = await handleTebakGambarGuess(message, client);
      if (tebakGambarProcessed) {
        return;
      }

      await handleAutoReaction(message, client);

      await handleStreakActivity(message, client);

      await handlePrefixCommand(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

/**
 * AI Auto Chat — balas otomatis pesan member di channel AI yang sudah di-set.
 * Hanya aktif di channel tersebut; channel lain tidak disentuh sama sekali.
 * @returns {Promise<boolean>} true kalau pesan "dimiliki" handler ini (jangan diproses handler lain).
 */
async function handleAiAutoChat(message, client) {
  try {
    if (!isAiConfigured()) {
      return false;
    }

    const guildConfig = await getGuildConfig(client, message.guild.id);
    const ai = guildConfig?.ai;
    if (!ai || ai.enabled !== true || !ai.channelId) {
      return false;
    }

    // Cuma aktif di channel AI yang di-set. Channel lain diabaikan.
    if (message.channel.id !== ai.channelId) {
      return false;
    }

    // Pesan bot/webhook/sistem nggak pernah dibalas (anti-loop).
    if (message.author?.bot || message.webhookId || message.system) {
      return true;
    }

    const content = (message.content || '').trim();
    if (content.length === 0) {
      return true;
    }

    // Biarin prefix command tetap jalan di channel AI biar fitur lain nggak rusak.
    const prefix = guildConfig?.prefix || getCommandPrefix();
    if (prefix && content.startsWith(prefix)) {
      return false;
    }

    const guildId = message.guild.id;
    const userId = message.author.id;

    // Cooldown: kalau masih di dalam cooldown, diem aja biar nggak spam.
    if (getCooldownRemaining(guildId, userId) > 0) {
      return true;
    }
    markCooldown(guildId, userId);

    // Typing indicator selama AI mikir (di-refresh tiap 8 detik).
    message.channel.sendTyping().catch(() => null);
    const typingTimer = setInterval(() => {
      message.channel.sendTyping().catch(() => null);
    }, 8000);

    try {
      const displayName = message.member?.displayName || message.author.username;

      const reply = await enqueue(guildId, userId, () =>
        generateReply(guildId, userId, { userMessage: content, displayName }),
      );

      const chunks = splitMessage(reply);

      await message
        .reply({ content: chunks[0], allowedMentions: { repliedUser: false, parse: [] } })
        .catch(() =>
          message.channel
            .send({ content: chunks[0], allowedMentions: { parse: [] } })
            .catch(() => null),
        );

      for (const chunk of chunks.slice(1)) {
        await message.channel
          .send({ content: chunk, allowedMentions: { parse: [] } })
          .catch(() => null);
      }
    } catch (error) {
      logger.error('AI auto chat error:', { guildId, userId, error: error?.message });
      await message.channel
        .send({ content: getAiErrorMessage(error), allowedMentions: { parse: [] } })
        .catch(() => null);
    } finally {
      clearInterval(typingTimer);
    }

    return true;
  } catch (error) {
    // Error tak terduga jangan sampai ngeblok handler lain.
    logger.error('Error in AI auto chat handler:', error);
    return false;
  }
}

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    
    if (!parsed) {
      return; 
    }

    let { commandName, args } = parsed;

    logger.info(`Prefix command detected: ${commandName}, args: ${args.join(', ')}`);

    const resolvedCommandName = resolveCommandAlias(commandName);
    logger.info(`Resolved command name: ${resolvedCommandName}`);
    const command = client.commands.get(resolvedCommandName);

    if (!command) {
      logger.warn(`Command not found: ${resolvedCommandName}`);
      return; 
    }

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      // Silent ignore: do not respond to prefix commands that are slash-only.
      // This lets the same message be handled by another bot in the server.
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    logger.info(`Executing prefix command: ${prefix}${commandName} (resolved to ${resolvedCommandName}) by ${message.author.tag}`);
    
    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleCountingGame(message, client) {
  try {
    const config = await getCountingGameConfig(client, message.guild.id);
    if (!config.enabled || !config.channelId || message.channel.id !== config.channelId) {
      return false;
    }

    const content = message.content.trim();
    const validCount = isValidCountingMessage(content, config);
    const invalidAttempt = !validCount || message.author.id === config.lastUserId;

    if (invalidAttempt) {
      await message.delete().catch(() => {});
      await saveCountingGameConfig(client, message.guild.id, {
        ...config,
        nextNumber: 1,
        lastUserId: null,
        currentStreak: 0,
      });

      const failureMessage = await message.channel.send(`❌ Count broken by <@${message.author.id}>. The sequence has been reset to **1**.`);
      setTimeout(() => {
        failureMessage.delete().catch(() => {});
      }, 10000);

      return true;
    }

    await recordCorrectCount(client, message.guild.id, message.author.id);
    return true;
  } catch (error) {
    logger.error('Error handling counting game:', error);
    return false;
  }
}

async function handleStreakActivity(message, client) {
  try {
    if (!message.author || message.author.bot || !message.guild) {
      return;
    }

    const guildConfig = await getGuildConfig(client, message.guild.id);
    if (guildConfig?.streak?.enabled !== true) {
      return;
    }

    // Streak hanya aktif di channel streak yang di-set oleh /streak channel.
    // Chat di channel lain tidak akan memicu bot merespons di channel streak.
    const streakChannelId = guildConfig.streak.channelId;
    if (streakChannelId && message.channel.id !== streakChannelId) {
      return;
    }

    const result = await StreakService.recordActivity(client, message.guild.id, message.author.id, {
      timestamp: message.createdTimestamp,
    });

    if (!result?.incremented && !result?.alreadyOn) {
      return;
    }

    const embed = result.incremented
      ? createEmbed({
          title: '<a:Firee:1572339013346402384> STREAK UPDATED',
          description: `Wihh ${message.author} streak api kamu udah nyampe **${result.streak.currentCount} hari** nih! jangan sampai putus yaa, terus nyalain apinya 🔥`,
          color: 'success',
          thumbnail: message.author.displayAvatarURL({ dynamic: true, size: 128 }),
        })
      : createEmbed({
          title: '<a:Firee:1572339013346402384> THE FIRE IS ALREADY ON',
          description: `Streak kamu ${message.author} udah aktif lagi\nBesok jangan lupa mampir dan chat lagi yaa`,
          color: 'success',
        });

    const streakChannel = streakChannelId
      ? message.guild.channels.cache.get(streakChannelId)
      : null;

    if (streakChannel && streakChannel.isTextBased()) {
      await streakChannel
        .send({ embeds: [embed], allowedMentions: { users: [message.author.id] } })
        .catch(() => null);
    } else {
      await message.reply({
        embeds: [embed],
        allowedMentions: { users: [message.author.id], repliedUser: true },
      }).catch(() => null);
    }
  } catch (error) {
    logger.error('Error handling streak activity:', error);
  }
}
