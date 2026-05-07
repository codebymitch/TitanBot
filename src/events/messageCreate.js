




import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { addXp } from '../services/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { AutoresponderService } from '../services/autoresponderService.js';
import { AntiNsfwService } from '../services/antiNsfwService.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;
const PREFIX = '?';
const MOD_PREFIX = '>';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      if (message.content.startsWith(MOD_PREFIX)) {
        await handleModCommand(message, client);
        return;
      }

      if (message.content.startsWith(PREFIX)) {
        await handlePrefixCommand(message, client);
        return;
      }

      const flagged = await AntiNsfwService.checkMessage(client, message);
      if (flagged) return;

      await AutoresponderService.check(client, message);
      await handleLeveling(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};








function parseDuration(str) {
  const match = str?.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return null;
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const ms = parseInt(match[1]) * multipliers[match[2].toLowerCase()];
  return ms > 28 * 86400000 ? null : ms;
}

function modEmbed(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description).setTimestamp();
}

async function handleModCommand(message, client) {
  const args = message.content.slice(MOD_PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();
  if (!command) return;

  const member = message.member;
  const guild = message.guild;
  const perms = member.permissions;

  const ownerIds = process.env.OWNER_IDS?.split(',').map(id => id.trim()) ?? [];
  const isOwner = ownerIds.includes(message.author.id);

  const NO_PERM = () => message.reply({ embeds: [modEmbed(0xED4245, '❌ You do not have permission to use this command.')] });
  const BOT_NO_PERM = () => message.reply({ embeds: [modEmbed(0xED4245, '❌ I am missing the required permissions.')] });
  const hasPerm = (perm) => isOwner || perms.has(perm);

  try {
    switch (command) {

      case 'ban': {
        if (!hasPerm('BanMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('BanMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>ban @user [reason]`');
        if (!target.bannable) return message.reply({ embeds: [modEmbed(0xED4245, '❌ I cannot ban that user.')] });
        const reason = args.join(' ') || 'No reason provided';
        await target.ban({ reason: `${message.author.tag}: ${reason}` });
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ **${target.user.tag}** has been banned.\n📝 Reason: ${reason}`)] });
      }

      case 'kick': {
        if (!hasPerm('KickMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('KickMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>kick @user [reason]`');
        if (!target.kickable) return message.reply({ embeds: [modEmbed(0xED4245, '❌ I cannot kick that user.')] });
        const reason = args.join(' ') || 'No reason provided';
        await target.kick(`${message.author.tag}: ${reason}`);
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ **${target.user.tag}** has been kicked.\n📝 Reason: ${reason}`)] });
      }

      case 'warn': {
        if (!hasPerm('ModerateMembers')) return NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>warn @user [reason]`');
        const reason = args.join(' ') || 'No reason provided';
        try {
          await target.send({ embeds: [modEmbed(0xFEE75C, `⚠️ You have been warned in **${guild.name}**.\n📝 Reason: ${reason}`)] });
        } catch {}
        return message.reply({ embeds: [modEmbed(0xFEE75C, `⚠️ **${target.user.tag}** has been warned.\n📝 Reason: ${reason}`)] });
      }

      case 'timeout':
      case 'mute': {
        if (!hasPerm('ModerateMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('ModerateMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>timeout @user <duration> [reason]`\nDuration: `10s`, `5m`, `2h`, `1d`');
        const durationStr = args.shift();
        const ms = parseDuration(durationStr);
        if (!ms) return message.reply('Invalid duration. Use: `10s`, `5m`, `2h`, `1d` (max 28 days)');
        const reason = args.join(' ') || 'No reason provided';
        await target.timeout(ms, `${message.author.tag}: ${reason}`);
        return message.reply({ embeds: [modEmbed(0xFEE75C, `🔇 **${target.user.tag}** timed out for **${durationStr}**.\n📝 Reason: ${reason}`)] });
      }

      case 'untimeout':
      case 'unmute': {
        if (!hasPerm('ModerateMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('ModerateMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>untimeout @user`');
        await target.timeout(null);
        return message.reply({ embeds: [modEmbed(0x57F287, `🔊 **${target.user.tag}**'s timeout has been removed.`)] });
      }

      case 'unban': {
        if (!hasPerm('BanMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('BanMembers')) return BOT_NO_PERM();
        const userId = args[0];
        if (!userId) return message.reply('Usage: `>unban <userID> [reason]`');
        const reason = args.slice(1).join(' ') || 'No reason provided';
        await guild.members.unban(userId, `${message.author.tag}: ${reason}`).catch(() => null);
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ User \`${userId}\` has been unbanned.`)] });
      }

      case 'purge':
      case 'clear': {
        if (!hasPerm('ManageMessages')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageMessages')) return BOT_NO_PERM();
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount < 1 || amount > 100) return message.reply('Usage: `>purge <1–100>`');
        await message.delete().catch(() => {});
        const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
        const count = deleted?.size ?? 0;
        const confirm = await message.channel.send({ embeds: [modEmbed(0x57F287, `🗑️ Deleted **${count}** message(s).`)] });
        setTimeout(() => confirm.delete().catch(() => {}), 4000);
        return;
      }

      case 'slowmode': {
        if (!hasPerm('ManageChannels')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageChannels')) return BOT_NO_PERM();
        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) return message.reply('Usage: `>slowmode <0–21600>` (seconds, 0 = off)');
        await message.channel.setRateLimitPerUser(seconds);
        const label = seconds === 0 ? 'disabled' : `set to **${seconds}s**`;
        return message.reply({ embeds: [modEmbed(0x57F287, `🐌 Slowmode ${label}.`)] });
      }

      case 'lock': {
        if (!hasPerm('ManageChannels')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageChannels')) return BOT_NO_PERM();
        const reason = args.join(' ') || 'No reason provided';
        await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        return message.reply({ embeds: [modEmbed(0xED4245, `🔒 Channel locked.\n📝 Reason: ${reason}`)] });
      }

      case 'unlock': {
        if (!hasPerm('ManageChannels')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageChannels')) return BOT_NO_PERM();
        await message.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        return message.reply({ embeds: [modEmbed(0x57F287, '🔓 Channel unlocked.')] });
      }

      case 'nick': {
        if (!hasPerm('ManageNicknames')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageNicknames')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>nick @user <new nickname>` or `>nick @user` to reset');
        const nick = args.join(' ') || null;
        await target.setNickname(nick);
        return message.reply({ embeds: [modEmbed(0x57F287, nick ? `✅ Nickname set to **${nick}**.` : `✅ Nickname reset for **${target.user.tag}**.`)] });
      }

      case 'role': {
        if (!hasPerm('ManageRoles')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageRoles')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!target || !role) return message.reply('Usage: `>role @user @role`');
        if (target.roles.cache.has(role.id)) {
          await target.roles.remove(role);
          return message.reply({ embeds: [modEmbed(0xFEE75C, `➖ Removed **${role.name}** from **${target.user.tag}**.`)] });
        } else {
          await target.roles.add(role);
          return message.reply({ embeds: [modEmbed(0x57F287, `➕ Added **${role.name}** to **${target.user.tag}**.`)] });
        }
      }

      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('🛡️ Mod Prefix Commands (`>`)')
          .addFields(
            { name: 'Members', value: '`>ban @user [reason]`\n`>kick @user [reason]`\n`>warn @user [reason]`\n`>unban <userID> [reason]`', inline: true },
            { name: 'Timeout', value: '`>timeout @user <dur> [reason]`\n`>untimeout @user`\nDurations: `10s` `5m` `2h` `1d`', inline: true },
            { name: 'Channel', value: '`>purge <1-100>`\n`>slowmode <seconds>`\n`>lock [reason]`\n`>unlock`', inline: true },
            { name: 'Other', value: '`>nick @user [nickname]`\n`>role @user @role`\n`>help`', inline: true },
          )
          .setFooter({ text: 'Requires appropriate Discord permissions' });
        return message.reply({ embeds: [embed] });
      }

      default:
        break;
    }
  } catch (err) {
    logger.error(`Mod prefix command error (${command}):`, err);
    message.reply({ embeds: [modEmbed(0xED4245, `❌ Something went wrong: ${err.message}`)] }).catch(() => {});
  }
}

async function handlePrefixCommand(message, client) {
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      case 'joke': {
        const type = args[0] ? args[0].charAt(0).toUpperCase() + args[0].slice(1).toLowerCase() : 'Any';
        const valid = ['Any', 'Pun', 'Programming', 'Misc', 'Dark'];
        const category = valid.includes(type) ? type : 'Any';
        const res = await fetch(`https://v2.jokeapi.dev/joke/${category}?blacklistFlags=racist,sexist`);
        if (!res.ok) return message.reply('Could not fetch a joke right now.');
        const data = await res.json();
        const text = data.type === 'twopart' ? `${data.setup}\n\n||${data.delivery}||` : data.joke;
        const embed = new EmbedBuilder().setTitle(`😂 ${data.category} Joke`).setDescription(text).setColor(0xFEE75C);
        return message.reply({ embeds: [embed] });
      }

      case 'meme': {
        const res = await fetch('https://meme-api.com/gimme');
        if (!res.ok) return message.reply('Could not fetch a meme right now.');
        const data = await res.json();
        if (data.nsfw) return message.reply('Got an NSFW meme, try again!');
        const embed = new EmbedBuilder()
          .setTitle(data.title).setURL(data.postLink)
          .setImage(data.url).setColor(0x5865F2)
          .setFooter({ text: `r/${data.subreddit} • 👍 ${data.ups}` });
        return message.reply({ embeds: [embed] });
      }

      case 'quote': {
        const res = await fetch('https://zenquotes.io/api/random');
        if (!res.ok) return message.reply('Could not fetch a quote right now.');
        const [data] = await res.json();
        const embed = new EmbedBuilder()
          .setDescription(`*"${data.q}"*\n\n— **${data.a}**`)
          .setColor(0x5865F2).setFooter({ text: 'ZenQuotes.io' });
        return message.reply({ embeds: [embed] });
      }

      case 'flip': {
        const result = Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails';
        return message.reply(result);
      }

      case 'roll': {
        const sides = parseInt(args[0]) || 6;
        if (sides < 2 || sides > 10000) return message.reply('Please provide a number between 2 and 10,000.');
        const roll = Math.floor(Math.random() * sides) + 1;
        return message.reply(`🎲 You rolled a **${roll}** (1–${sides})`);
      }

      case 'avatar': {
        const mentioned = message.mentions.users.first();
        const target = mentioned || message.author;
        const embed = new EmbedBuilder()
          .setTitle(`${target.username}'s Avatar`)
          .setImage(target.displayAvatarURL({ size: 1024 }))
          .setColor(0x5865F2);
        return message.reply({ embeds: [embed] });
      }

      case 'fact': {
        const res = await fetch('https://uselessfacts.jsph.pl/api/v2/facts/random?language=en');
        if (!res.ok) return message.reply('Could not fetch a fact right now.');
        const data = await res.json();
        const embed = new EmbedBuilder().setTitle('💡 Random Fact').setDescription(data.text).setColor(0x3498DB);
        return message.reply({ embeds: [embed] });
      }

      case 'github': {
        if (!args[0]) return message.reply('Usage: `?github <username>` or `?github <user/repo>`');
        const query = args[0];
        const isRepo = query.includes('/');
        const url = isRepo ? `https://api.github.com/repos/${query}` : `https://api.github.com/users/${query}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'itay100k-bot' } });
        if (res.status === 404) return message.reply(`No GitHub ${isRepo ? 'repository' : 'user'} found for \`${query}\`.`);
        if (!res.ok) return message.reply('Could not reach the GitHub API.');
        const data = await res.json();
        const embed = new EmbedBuilder().setColor(0x5865F2).setURL(data.html_url).setFooter({ text: 'GitHub' });
        if (isRepo) {
          embed.setTitle(data.full_name).setDescription(data.description || 'No description.')
            .addFields(
              { name: '⭐ Stars', value: String(data.stargazers_count), inline: true },
              { name: '🍴 Forks', value: String(data.forks_count), inline: true },
              { name: '📝 Language', value: data.language || 'Unknown', inline: true },
            );
        } else {
          embed.setTitle(data.name || data.login).setDescription(data.bio || 'No bio.')
            .setThumbnail(data.avatar_url)
            .addFields(
              { name: '👥 Followers', value: String(data.followers), inline: true },
              { name: '📦 Repos', value: String(data.public_repos), inline: true },
            );
        }
        return message.reply({ embeds: [embed] });
      }

      case 'help': {
        const embed = new EmbedBuilder()
          .setTitle('? Prefix Commands')
          .setDescription([
            '`?joke [pun/programming/dark/misc]` — Random joke',
            '`?meme` — Random meme',
            '`?quote` — Inspirational quote',
            '`?flip` — Coin flip',
            '`?roll [sides]` — Roll a dice (default: 6)',
            '`?avatar [@user]` — Show avatar',
            '`?fact` — Random fact',
            '`?github <user or user/repo>` — GitHub lookup',
          ].join('\n'))
          .setColor(0x5865F2);
        return message.reply({ embeds: [embed] });
      }

      default:
        break;
    }
  } catch (err) {
    logger.error(`Prefix command error (${command}):`, err);
    message.reply('Something went wrong. Try again later.').catch(() => {});
  }
}

async function handleLeveling(message, client) {
  try {
    const rateLimitKey = `xp-event:${message.guild.id}:${message.author.id}`;
    const canProcess = await checkRateLimit(rateLimitKey, MESSAGE_XP_RATE_LIMIT_ATTEMPTS, MESSAGE_XP_RATE_LIMIT_WINDOW_MS);
    if (!canProcess) {
      return;
    }

    const levelingConfig = await getLevelingConfig(client, message.guild.id);
    
    if (!levelingConfig?.enabled) {
      return;
    }

    
    if (levelingConfig.ignoredChannels?.includes(message.channel.id)) {
      return;
    }

    
    if (levelingConfig.ignoredRoles?.length > 0) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => {
        return null;
      });
      if (member && member.roles.cache.some(role => levelingConfig.ignoredRoles.includes(role.id))) {
        return;
      }
    }

    
    if (levelingConfig.blacklistedUsers?.includes(message.author.id)) {
      return;
    }

    
    if (!message.content || message.content.trim().length === 0) {
      return;
    }

    const userData = await getUserLevelData(client, message.guild.id, message.author.id);
    
    
    const cooldownTime = levelingConfig.xpCooldown || 60;
    const now = Date.now();
    const timeSinceLastMessage = now - (userData.lastMessage || 0);
    
    
    if (timeSinceLastMessage < cooldownTime * 1000) {
      return;
    }

    
    const minXP = levelingConfig.xpRange?.min || levelingConfig.xpPerMessage?.min || 15;
    const maxXP = levelingConfig.xpRange?.max || levelingConfig.xpPerMessage?.max || 25;

    
    const safeMinXP = Math.max(1, minXP);
    const safeMaxXP = Math.max(safeMinXP, maxXP);

    
    const xpToGive = Math.floor(Math.random() * (safeMaxXP - safeMinXP + 1)) + safeMinXP;

    
    let finalXP = xpToGive;
    if (levelingConfig.xpMultiplier && levelingConfig.xpMultiplier > 1) {
      finalXP = Math.floor(finalXP * levelingConfig.xpMultiplier);
    }

    
    const result = await addXp(client, message.guild, message.member, finalXP);
    
    if (result.success && result.leveledUp) {
      logger.info(
        `${message.author.tag} leveled up to level ${result.level} in ${message.guild.name}`
      );
    }
  } catch (error) {
    logger.error('Error handling leveling for message:', error);
  }
}


