import { Events } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling/leveling.js';
import { addXp } from '../services/leveling/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;
      logger.debug(`Message received from ${message.author.tag}: ${message.content}`);
      await handlePrefixCommand(message, client);
      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);
    if (!parsed) return;

    const { commandName, args } = parsed;
    const resolvedCommandName = resolveCommandAlias(commandName);
    const command = client.commands.get(resolvedCommandName);
    if (!command) return;

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({ embeds: [createEmbed({ title: 'Maintenance Mode', description: getBotMessage('maintenanceMode'), color: 'warning' })] }).catch(() => {});
      return;
    }
    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({ embeds: [createEmbed({ title: 'Feature Disabled', description: getBotMessage('commandDisabled'), color: 'error' })] }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        await message.channel.send({ embeds: [createEmbed({ title: 'Slash Command Only', description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`, color: 'info' })] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      await message.channel.send({ embeds: [createEmbed({ title: 'Command Disabled', description: 'This command has been disabled for this server.', color: 'error' })] }).catch(() => {});
      return;
    }

    const protection = await enforceAbuseProtection({ guildId: message.guild.id, user: message.author }, command, resolvedCommandName);
    if (!protection.allowed) {
      const cooldown = formatCooldownDuration(protection.remainingMs);
      await message.channel.send({ embeds: [createEmbed({ title: 'Command Cooldown', description: `This command is on cooldown. Please wait ${cooldown} before trying again.`, color: 'error' })] }).catch(() => {});
      return;
    }

    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    if (!(await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS))) return;
    const config = await getLevelingConfig(client, message.guild.id);
    if (!config?.enabled || config.ignoredChannels?.includes(message.channel.id)) return;
    if (config.ignoredRoles?.length) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.roles.cache.some((role) => config.ignoredRoles.includes(role.id))) return;
    }
    if (config.blacklistedUsers?.includes(message.author.id) || !message.content?.trim()) return;
    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    if (Date.now() - (userData.lastMessage || 0) < (config.xpCooldown || 60) * 1000) return;
    const minXP = Math.max(1, config.xpRange?.min || config.xpPerMessage?.min || 15);
    const maxXP = Math.max(minXP, config.xpRange?.max || config.xpPerMessage?.max || 25);
    let xp = Math.floor(Math.random() * (maxXP - minXP + 1)) + minXP;
    if (config.xpMultiplier > 1) xp = Math.floor(xp * config.xpMultiplier);
    const result = await addXp(client, message.guild, message.member, xp);
    if (result?.leveledUp) logger.info(`${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`);
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}
