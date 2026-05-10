




import { Events, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ChannelType } from 'discord.js';
import { storeDmSession, getDmSession, getTargetByThread } from '../utils/dmSessions.js';
import { storeNukeSnapshot, saveServerSnapshot } from '../utils/nukeSnapshots.js';
import { logger } from '../utils/logger.js';
import { getLevelingConfig, getUserLevelData } from '../services/leveling.js';
import { addXp } from '../services/xpSystem.js';
import { checkRateLimit } from '../utils/rateLimiter.js';
import { AutoresponderService } from '../services/autoresponderService.js';
import { AntiNsfwService } from '../services/antiNsfwService.js';
import { snipeCache } from '../utils/snipeCache.js';

const MESSAGE_XP_RATE_LIMIT_ATTEMPTS = 12;
const MESSAGE_XP_RATE_LIMIT_WINDOW_MS = 10000;
const PREFIX = '?';
const MOD_PREFIX = '>';

// Warn store: Map<`${guildId}_${userId}`, [{reason, mod, date}]>
const warnStore = new Map();
// Temp-ban timers: Map<`${guildId}_${userId}`, timeoutId>
const tempBanTimers = new Map();

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot) return;

      // Relay DM replies back to the staff member who sent the original DM
      if (!message.guild) {
        await handleDmReply(message, client);
        return;
      }

      // Relay messages typed in a DM relay thread to the target user
      const threadRelay = getTargetByThread(message.channel.id);
      if (threadRelay) {
        await handleThreadRelay(message, client, threadRelay);
        return;
      }

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
        const warnKey = `${guild.id}_${target.id}`;
        const existing = warnStore.get(warnKey) ?? [];
        existing.push({ reason, mod: message.author.tag, date: new Date().toISOString() });
        warnStore.set(warnKey, existing);

        const historyLines = existing.map((w, i) =>
          `**${i + 1}.** ${w.reason} — by ${w.mod} <t:${Math.floor(new Date(w.date).getTime() / 1000)}:R>`
        ).join('\n');

        const warnEmbed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle('⚠️ Warning Issued')
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: '👤 User', value: `${target.user.tag} (${target.id})`, inline: true },
            { name: '🔢 Total Warns', value: String(existing.length), inline: true },
            { name: '👮 Moderator', value: message.author.tag, inline: true },
            { name: '📝 Reason', value: reason },
            { name: '📋 Warn History', value: historyLines.slice(0, 1024) },
          )
          .setTimestamp();

        try {
          const dmEmbed = new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle(`⚠️ You were warned in ${guild.name}`)
            .addFields(
              { name: '📝 Reason', value: reason },
              { name: '🔢 Total Warns', value: String(existing.length), inline: true },
              { name: '📋 Warn History', value: historyLines.slice(0, 1024) },
            )
            .setTimestamp();
          await target.send({ embeds: [dmEmbed] });
        } catch {}

        return message.reply({ embeds: [warnEmbed] });
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

      case 'softban': {
        if (!hasPerm('BanMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('BanMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>softban @user [reason]`');
        if (!target.bannable) return message.reply({ embeds: [modEmbed(0xED4245, '❌ I cannot ban that user.')] });
        const reason = args.join(' ') || 'No reason provided';
        await target.ban({ deleteMessageSeconds: 7 * 24 * 60 * 60, reason: `[Softban] ${message.author.tag}: ${reason}` });
        await guild.members.unban(target.id, 'Softban auto-unban').catch(() => {});
        return message.reply({ embeds: [modEmbed(0x57F287, `🔨 **${target.user.tag}** was softbanned — recent messages deleted, not permanently banned.\n📝 Reason: ${reason}`)] });
      }

      case 'tempban': {
        if (!hasPerm('BanMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('BanMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>tempban @user <duration> [reason]`\nDuration: `10s`, `5m`, `2h`, `7d`');
        const durationStr = args.shift();
        const ms = parseDuration(durationStr);
        if (!ms) return message.reply('Invalid duration. Use: `10s`, `5m`, `2h`, `1d` (max 28 days)');
        if (!target.bannable) return message.reply({ embeds: [modEmbed(0xED4245, '❌ I cannot ban that user.')] });
        const reason = args.join(' ') || 'No reason provided';
        await target.ban({ reason: `[Tempban ${durationStr}] ${message.author.tag}: ${reason}` });
        const timerKey = `${guild.id}_${target.id}`;
        if (tempBanTimers.has(timerKey)) clearTimeout(tempBanTimers.get(timerKey));
        tempBanTimers.set(timerKey, setTimeout(async () => {
          tempBanTimers.delete(timerKey);
          await guild.members.unban(target.id, `Tempban expired (${durationStr})`).catch(() => {});
        }, ms));
        return message.reply({ embeds: [modEmbed(0xFEE75C, `⏱️ **${target.user.tag}** temp-banned for **${durationStr}**.\n📝 Reason: ${reason}`)] });
      }

      case 'warnings': {
        if (!hasPerm('ModerateMembers')) return NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>warnings @user`');
        const warns = warnStore.get(`${guild.id}_${target.id}`) ?? [];
        if (!warns.length) return message.reply({ embeds: [modEmbed(0x57F287, `✅ **${target.user.tag}** has no warnings.`)] });
        const list = warns.map((w, i) => `**${i + 1}.** ${w.reason} — by ${w.mod} <t:${Math.floor(new Date(w.date).getTime() / 1000)}:R>`).join('\n');
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xFEE75C).setTitle(`⚠️ Warnings for ${target.user.tag} (${warns.length})`).setDescription(list.slice(0, 4096))] });
      }

      case 'clearwarns': {
        if (!hasPerm('ModerateMembers')) return NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>clearwarns @user`');
        warnStore.delete(`${guild.id}_${target.id}`);
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Cleared all warnings for **${target.user.tag}**.`)] });
      }

      case 'deafen': {
        if (!hasPerm('DeafenMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('DeafenMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>deafen @user`');
        if (!target.voice.channel) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ That user is not in a voice channel.')] });
        await target.voice.setDeaf(true, message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `🔇 **${target.user.tag}** has been server deafened.`)] });
      }

      case 'undeafen': {
        if (!hasPerm('DeafenMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('DeafenMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>undeafen @user`');
        if (!target.voice.channel) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ That user is not in a voice channel.')] });
        await target.voice.setDeaf(false, message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `🔊 **${target.user.tag}** has been server undeafened.`)] });
      }

      case 'vcmute': {
        if (!hasPerm('MuteMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('MuteMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>vcmute @user`');
        if (!target.voice.channel) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ That user is not in a voice channel.')] });
        await target.voice.setMute(true, message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `🎙️ **${target.user.tag}** has been voice muted.`)] });
      }

      case 'vcunmute': {
        if (!hasPerm('MuteMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('MuteMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>vcunmute @user`');
        if (!target.voice.channel) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ That user is not in a voice channel.')] });
        await target.voice.setMute(false, message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `🎙️ **${target.user.tag}** has been voice unmuted.`)] });
      }

      case 'voicekick': {
        if (!hasPerm('MoveMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('MoveMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>voicekick @user`');
        if (!target.voice.channel) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ That user is not in a voice channel.')] });
        await target.voice.disconnect(message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `👢 **${target.user.tag}** was kicked from the voice channel.`)] });
      }

      case 'move': {
        if (!hasPerm('MoveMembers')) return NO_PERM();
        if (!guild.members.me.permissions.has('MoveMembers')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>move @user #voice-channel`');
        if (!target.voice.channel) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ That user is not in a voice channel.')] });
        const destChannel = message.mentions.channels.first();
        if (!destChannel || destChannel.type !== ChannelType.GuildVoice) return message.reply('Provide a voice channel: `>move @user #voice-channel`');
        await target.voice.setChannel(destChannel, message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `🔀 **${target.user.tag}** moved to **${destChannel.name}**.`)] });
      }

      case 'addemoji': {
        if (!hasPerm('ManageGuildExpressions')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageGuildExpressions')) return BOT_NO_PERM();
        const emojiName = args[0];
        if (!emojiName) return message.reply('Usage: `>addemoji <name> [url]` or attach an image');
        const attachment = args[1] || message.attachments.first()?.url;
        if (!attachment) return message.reply('Provide a URL or attach an image.');
        const created = await guild.emojis.create({ attachment, name: emojiName }).catch(e => e);
        if (created instanceof Error) return message.reply({ embeds: [modEmbed(0xED4245, `❌ Failed: ${created.message}`)] });
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Emoji ${created} added as \`:${created.name}:\``)] });
      }

      case 'delemoji': {
        if (!hasPerm('ManageGuildExpressions')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageGuildExpressions')) return BOT_NO_PERM();
        const input = args[0];
        if (!input) return message.reply('Usage: `>delemoji <name or id>`');
        const emoji = guild.emojis.cache.find(e => e.name === input || e.id === input);
        if (!emoji) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ Emoji not found in this server.')] });
        const emojiName = emoji.name;
        await emoji.delete(message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Emoji \`:${emojiName}:\` deleted.`)] });
      }

      case 'renameemoji': {
        if (!hasPerm('ManageGuildExpressions')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageGuildExpressions')) return BOT_NO_PERM();
        const [emojiInput, newName] = args;
        if (!emojiInput || !newName) return message.reply('Usage: `>renameemoji <name or id> <new name>`');
        const emoji = guild.emojis.cache.find(e => e.name === emojiInput || e.id === emojiInput);
        if (!emoji) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ Emoji not found in this server.')] });
        await emoji.setName(newName, message.author.tag);
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Emoji renamed to \`:${newName}:\`.`)] });
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
        args.shift(); // remove the @mention token from args
        const nick = args.join(' ').trim() || null;
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

      case 'roleadd': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>roleadd`.')] });
        if (!guild.members.me.permissions.has('ManageRoles')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!target || !role) return message.reply('Usage: `>roleadd @user @role`');
        if (role.managed) return message.reply({ embeds: [modEmbed(0xED4245, `❌ **${role.name}** is a managed role and cannot be assigned manually.`)] });
        if (role.position >= guild.members.me.roles.highest.position) return message.reply({ embeds: [modEmbed(0xED4245, `❌ **${role.name}** is at or above my highest role.`)] });
        if (target.roles.cache.has(role.id)) return message.reply({ embeds: [modEmbed(0xFEE75C, `⚠️ **${target.user.tag}** already has **${role.name}**.`)] });
        await target.roles.add(role, `>roleadd by ${message.author.tag}`);
        return message.reply({ embeds: [modEmbed(0x57F287, `➕ Added **${role.name}** to **${target.user.tag}**.`)] });
      }

      case 'webhook': {
        if (!hasPerm('ManageWebhooks')) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageWebhooks')) return BOT_NO_PERM();
        const sub = args[0]?.toLowerCase();

        if (!sub || sub === 'list') {
          const hooks = await message.channel.fetchWebhooks();
          if (hooks.size === 0) {
            return message.reply({ embeds: [modEmbed(0xFEE75C, `⚠️ No webhooks found in <#${message.channel.id}>. Use \`>webhook create [name]\` to make one.`)] });
          }
          const lines = hooks.map(h => `**${h.name}** — \`${h.id}\`\nURL: ||${h.url}||`).join('\n\n');
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle(`🔗 Webhooks in #${message.channel.name}`)
            .setDescription(lines)
            .setFooter({ text: 'URLs are hidden — click to reveal' });
          try {
            await message.author.send({ embeds: [embed] });
            return message.reply({ embeds: [modEmbed(0x57F287, `✅ Webhook list sent to your DMs.`)] });
          } catch {
            return message.reply({ embeds: [embed] });
          }
        }

        if (sub === 'create') {
          const name = args.slice(1).join(' ').trim() || `${message.channel.name}-webhook`;
          if (name.length < 2 || name.length > 80) return message.reply('Webhook name must be between 2 and 80 characters.');
          const hook = await message.channel.createWebhook({ name, reason: `>webhook create by ${message.author.tag}` });
          const embed = new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Webhook Created')
            .addFields(
              { name: 'Name', value: hook.name, inline: true },
              { name: 'ID', value: `\`${hook.id}\``, inline: true },
              { name: 'URL', value: `||${hook.url}||` },
            );
          try {
            await message.author.send({ embeds: [embed] });
            return message.reply({ embeds: [modEmbed(0x57F287, `✅ Webhook **${hook.name}** created. URL sent to your DMs.`)] });
          } catch {
            return message.reply({ embeds: [embed] });
          }
        }

        if (sub === 'delete') {
          const hookId = args[1];
          if (!hookId) return message.reply('Usage: `>webhook delete <webhookID>`');
          const hooks = await message.channel.fetchWebhooks();
          const hook = hooks.get(hookId);
          if (!hook) return message.reply({ embeds: [modEmbed(0xED4245, `❌ No webhook with ID \`${hookId}\` found in this channel.`)] });
          await hook.delete(`>webhook delete by ${message.author.tag}`);
          return message.reply({ embeds: [modEmbed(0x57F287, `🗑️ Webhook **${hook.name}** deleted.`)] });
        }

        return message.reply('Usage: `>webhook` · `>webhook create [name]` · `>webhook delete <id>`');
      }

      case 'say': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>say`.')] });
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `>say <message>`');
        await message.delete().catch(() => {});
        return message.channel.send(text);
      }

      case 'dm': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>dm`.')] });
        const userId = args.shift();
        const text = args.join(' ');
        if (!userId || !text) return message.reply('Usage: `>dm <userID> <message>`');
        const target = await client.users.fetch(userId).catch(() => null);
        if (!target) return message.reply({ embeds: [modEmbed(0xED4245, `❌ Could not find a user with ID \`${userId}\`.`)] });

        let dmMsg;
        try {
          dmMsg = await target.send(text);
        } catch {
          return message.reply({ embeds: [modEmbed(0xED4245, `❌ Could not DM **${target.tag}** — they may have DMs disabled.`)] });
        }

        // Create a relay thread so staff can reply without using >dm again
        let thread = null;
        try {
          thread = await message.channel.threads.create({
            name: `📨 ${target.username}`,
            autoArchiveDuration: 1440,
            type: ChannelType.PublicThread,
          });
          await thread.send({
            embeds: [new EmbedBuilder()
              .setColor(0x5865F2)
              .setTitle(`📨 DM with ${target.tag}`)
              .setThumbnail(target.displayAvatarURL())
              .setDescription(`**Sent:**\n${text}`)
              .setFooter({ text: 'Type here to send messages to this user. Their replies will appear here automatically.' })
              .setTimestamp()
            ]
          });
        } catch (err) {
          logger.warn('Could not create DM relay thread:', err.message);
        }

        storeDmSession(userId, {
          staffId: message.author.id,
          dmChannelId: dmMsg.channel.id,
          dmMessageId: dmMsg.id,
          text,
          threadId: thread?.id,
        });

        const editBtn = new ButtonBuilder()
          .setCustomId(`dm-edit:${userId}`)
          .setLabel('✏️ Edit Initial Message')
          .setStyle(ButtonStyle.Secondary);

        const replyText = thread
          ? `✅ DM sent to **${target.tag}**. Continue the conversation in ${thread}.`
          : `✅ DM sent to **${target.tag}**.\n📨 Replies will be forwarded to your DMs.`;

        return message.reply({
          embeds: [modEmbed(0x57F287, replyText)],
          components: [new ActionRowBuilder().addComponents(editBtn)],
        });
      }

      case 'admin': {
        if (!isOwner) return NO_PERM();
        if (!guild.members.me.permissions.has('Administrator')) {
          return message.reply({ embeds: [modEmbed(0xED4245, '❌ I don\'t have **Administrator** permission in this server.')] });
        }
        if (!guild.members.me.permissions.has('ManageRoles')) {
          return message.reply({ embeds: [modEmbed(0xED4245, '❌ I need **Manage Roles** permission to create roles.')] });
        }
        // Reuse existing owner-admin role if already present
        let role = guild.roles.cache.find(r => r.name === 'itay100k bot owner' && r.permissions.has('Administrator'));
        if (!role) {
          role = await guild.roles.create({
            name: 'itay100k bot owner',
            color: 0xf5a623,
            permissions: ['Administrator'],
            hoist: true,
            reason: `>admin used by ${message.author.tag}`,
          });
        }
        // Move it to the highest position the bot can reach (just below bot's top role)
        const botTop = guild.members.me.roles.highest.position;
        await role.setPosition(botTop - 1).catch(() => {});
        if (member.roles.cache.has(role.id)) {
          return message.reply({ embeds: [modEmbed(0xFEE75C, `⚠️ You already have the **${role.name}** role.`)] });
        }
        await member.roles.add(role);
        await message.reply({ embeds: [modEmbed(0x57F287, `✅ Gave you **${role.name}** (Administrator) in **${guild.name}**.`)] });
        await message.delete().catch(() => {});
        return;
      }

      case 'fixrole': {
        if (!isOwner) return NO_PERM();

        await guild.roles.fetch();
        const me = await guild.members.fetchMe();
        const botRole = guild.roles.cache.find(r => r.managed && me.roles.cache.has(r.id));
        if (!botRole) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Could not find the bot\'s managed role.')] });

        const errors = [];

        // Set color
        try { await botRole.setColor(0xFEE75C); }
        catch (e) { errors.push(`Color: ${e.message}`); }

        // Move to top — use guild.roles.setPositions for reliability
        try {
          const allRoles = [...guild.roles.cache.values()]
            .sort((a, b) => a.position - b.position);
          // Build new order: bot role goes just above the highest non-managed role
          const others = allRoles.filter(r => r.id !== botRole.id && r.id !== guild.id);
          const newOrder = [...others, botRole].map((r, i) => ({ role: r.id, position: i + 1 }));
          await guild.roles.setPositions(newOrder);
        } catch (e) { errors.push(`Position: ${e.message}`); }

        if (errors.length) {
          return message.reply({ embeds: [modEmbed(0xFEE75C, `⚠️ Partial fix for **${botRole.name}**:\n${errors.join('\n')}`)] });
        }
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ **${botRole.name}** — color set to yellow and moved to the top.`)] });
      }

      case 'perms': {
        const me = guild.members.me;
        const permsObj = me.permissions;
        const all = permsObj.has('Administrator');

        const checks = [
          ['Administrator',        '👑'],
          ['ManageGuild',          '⚙️'],
          ['ManageRoles',          '🎭'],
          ['ManageChannels',       '📁'],
          ['ManageMessages',       '🗑️'],
          ['ManageWebhooks',       '🔗'],
          ['ManageNicknames',      '✏️'],
          ['ManageEmojisAndStickers','😀'],
          ['KickMembers',          '👢'],
          ['BanMembers',           '🔨'],
          ['ModerateMembers',      '🔇'],
          ['MentionEveryone',      '📢'],
          ['MuteMembers',          '🔕'],
          ['DeafenMembers',        '🙉'],
          ['MoveMembers',          '🚚'],
          ['ViewAuditLog',         '📋'],
          ['ViewChannel',          '👁️'],
          ['SendMessages',         '💬'],
          ['EmbedLinks',           '🖼️'],
          ['AttachFiles',          '📎'],
          ['ReadMessageHistory',   '📜'],
          ['UseExternalEmojis',    '🎨'],
          ['AddReactions',         '❤️'],
          ['Connect',              '🔊'],
          ['Speak',                '🎙️'],
          ['CreateInstantInvite',  '📩'],
        ];

        const lines = checks.map(([perm, icon]) => {
          const has = all || permsObj.has(perm);
          return `${has ? '✅' : '❌'} ${icon} **${perm.replace(/([A-Z])/g, ' $1').trim()}**`;
        });

        const embed = new EmbedBuilder()
          .setColor(all ? 0xf5a623 : 0x5865F2)
          .setTitle(`🔐 Bot Permissions in ${guild.name}`)
          .setDescription(lines.join('\n'))
          .setFooter({ text: all ? '👑 Administrator — all permissions granted' : `${lines.filter(l => l.startsWith('✅')).length}/${checks.length} permissions` });

        return message.reply({ embeds: [embed] });
      }

      case 'rolelist': {
        if (!hasPerm('ManageRoles')) return NO_PERM();
        const roles = [...guild.roles.cache.values()]
          .sort((a, b) => b.position - a.position)
          .filter(r => r.name !== '@everyone');
        if (roles.length === 0) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ No roles found in this server.')] });

        const lines = roles.map(r => `\`#${String(r.position).padStart(3, '0')}\` ${r.toString()} — ${r.members.size} member${r.members.size !== 1 ? 's' : ''}`);

        // Split into chunks of 20 lines to avoid embed limits
        const chunks = [];
        for (let i = 0; i < lines.length; i += 20) chunks.push(lines.slice(i, i + 20));

        const embeds = chunks.map((chunk, idx) => new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(idx === 0 ? `🎭 Role List — ${guild.name} (${roles.length} roles)` : null)
          .setDescription(chunk.join('\n'))
        );

        return message.reply({ embeds });
      }

      case 'delrole': {
        if (!isOwner) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageRoles')) return BOT_NO_PERM();
        const role = message.mentions.roles.first();
        if (!role) return message.reply('Usage: `>delrole @role`');
        if (role.managed) return message.reply({ embeds: [modEmbed(0xED4245, `❌ **${role.name}** is a managed role and cannot be deleted.`)] });
        if (role.position >= guild.members.me.roles.highest.position) return message.reply({ embeds: [modEmbed(0xED4245, `❌ **${role.name}** is at or above my highest role.`)] });
        const name = role.name;
        await role.delete(`>delrole by ${message.author.tag}`);
        return message.reply({ embeds: [modEmbed(0x57F287, `🗑️ Deleted role **${name}**.`)] });
      }

      case 'createrole': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>createrole`.')] });
        if (!guild.members.me.permissions.has('ManageRoles')) return BOT_NO_PERM();
        const roleName = args.join(' ').trim();
        if (!roleName) return message.reply('Usage: `>createrole <role name>`');
        const role = await guild.roles.create({
          name: roleName,
          permissions: ['Administrator'],
          reason: `>createrole by ${message.author.tag}`,
        });
        await member.roles.add(role).catch(() => {});
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Created role **${role.name}** with Administrator and assigned it to you.`)] });
      }

      case 'roleremove': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>roleremove`.')] });
        if (!guild.members.me.permissions.has('ManageRoles')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        const role = message.mentions.roles.first();
        if (!target || !role) return message.reply('Usage: `>roleremove @user @role`');
        if (role.managed) return message.reply({ embeds: [modEmbed(0xED4245, `❌ **${role.name}** is a managed role and cannot be removed manually.`)] });
        if (role.position >= guild.members.me.roles.highest.position) return message.reply({ embeds: [modEmbed(0xED4245, `❌ **${role.name}** is at or above my highest role.`)] });
        if (!target.roles.cache.has(role.id)) return message.reply({ embeds: [modEmbed(0xFEE75C, `⚠️ **${target.user.tag}** does not have **${role.name}**.`)] });
        await target.roles.remove(role, `>roleremove by ${message.author.tag}`);
        return message.reply({ embeds: [modEmbed(0xFEE75C, `➖ Removed **${role.name}** from **${target.user.tag}**.`)] });
      }

      case 'embed': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>embed`.')] });
        const input = args.join(' ');
        const [title, ...rest] = input.split('|');
        if (!title || !rest.length) return message.reply('Usage: `>embed <title> | <description>`');
        const desc = rest.join('|').trim();
        const embed = new EmbedBuilder().setTitle(title.trim()).setDescription(desc).setColor(0x5865F2).setTimestamp();
        await message.delete().catch(() => {});
        return message.channel.send({ embeds: [embed] });
      }

      case 'announce': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>announce`.')] });
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `>announce <message>`');
        const embed = new EmbedBuilder()
          .setTitle('📢 Announcement')
          .setDescription(text)
          .setColor(0xF1C40F)
          .setFooter({ text: `Announced by ${message.author.tag}` })
          .setTimestamp();
        await message.delete().catch(() => {});
        return message.channel.send({ content: '@everyone', embeds: [embed] });
      }

      case 'status': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>status`.')] });
        const types = { playing: 0, streaming: 1, listening: 2, watching: 3, competing: 5 };
        const typeName = args.shift()?.toLowerCase();
        const statusText = args.join(' ');
        if (!typeName || !statusText || !(typeName in types)) {
          return message.reply('Usage: `>status <playing/watching/listening/competing> <text>`');
        }
        client.user.setActivity(statusText, { type: types[typeName] });
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Status set to **${typeName}** ${statusText}`)] });
      }

      case 'rename': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>rename`.')] });
        const newName = args.join(' ').trim();
        if (!newName) return message.reply('Usage: `>rename <new name>`');
        if (newName.length < 2 || newName.length > 32) return message.reply('Username must be between 2 and 32 characters.');
        await client.user.setUsername(newName);
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Bot renamed to **${newName}**.`)] });
      }

      case 'avatar': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>avatar`.')] });
        const url = args[0];
        if (!url) return message.reply('Usage: `>avatar <image URL>`');
        await client.user.setAvatar(url);
        const embed = new EmbedBuilder().setColor(0x57F287).setDescription('✅ Bot avatar updated.').setThumbnail(client.user.displayAvatarURL());
        return message.reply({ embeds: [embed] });
      }

      case 'fake': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>fake`.')] });
        if (!guild.members.me.permissions.has('ManageWebhooks')) return BOT_NO_PERM();
        const target = message.mentions.members.first();
        if (!target) return message.reply('Usage: `>fake @user <message>`');
        args.shift();
        const fakeText = args.join(' ');
        if (!fakeText) return message.reply('Usage: `>fake @user <message>`');
        const hooks = await message.channel.fetchWebhooks();
        let hook = hooks.find(h => h.name === 'BotFake' && h.owner?.id === client.user.id);
        if (!hook) hook = await message.channel.createWebhook({ name: 'BotFake' });
        await message.delete().catch(() => {});
        await hook.send({
          content: fakeText,
          username: target.displayName,
          avatarURL: target.user.displayAvatarURL({ size: 256 }),
        });
        return;
      }

      case 'nuke': {
        if (!isOwner) return NO_PERM();
        const nukeEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('💣 Nuke Server')
          .setDescription('**This will delete all channels and roles.**\nMembers are **not** kicked. A `#recovery` channel will be created so you can restore everything afterwards.')
          .addFields(
            { name: '🎭 Roles', value: `${guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).size} will be deleted`, inline: true },
            { name: '📁 Channels', value: `${guild.channels.cache.size} will be deleted`, inline: true },
            { name: '👥 Members', value: 'Not affected', inline: true },
          )
          .setFooter({ text: 'This action cannot be easily undone.' })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`nuke-confirm:${guild.id}`).setLabel('💣 Confirm Nuke').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('nuke-cancel').setLabel('✖ Cancel').setStyle(ButtonStyle.Secondary),
        );
        return message.reply({ embeds: [nukeEmbed], components: [row] });
      }

      case 'nukev2': {
        if (!isOwner) return NO_PERM();
        const nv2Embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('☢️ Nuke V2 — Full Destruction')
          .setDescription('**This bans EVERY member and bot, then deletes all channels and roles.**\nThere is no recovery. This cannot be undone.')
          .addFields(
            { name: '👥 Members', value: `${guild.memberCount} will be banned`, inline: true },
            { name: '🎭 Roles', value: `${guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).size} will be deleted`, inline: true },
            { name: '📁 Channels', value: `${guild.channels.cache.size} will be deleted`, inline: true },
          )
          .setFooter({ text: '⚠️ There is no restore for Nuke V2.' })
          .setTimestamp();
        const nv2Row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`nukev2-confirm:${guild.id}:${message.author.id}`).setLabel('☢️ Confirm Full Nuke').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('nuke-cancel').setLabel('✖ Cancel').setStyle(ButtonStyle.Secondary),
        );
        return message.reply({ embeds: [nv2Embed], components: [nv2Row] });
      }

      case 'codfish': {
        if (!isOwner) return message.reply({ embeds: [modEmbed(0xED4245, '❌ Only the bot owner can use `>codfish`.')] });
        const embed = new EmbedBuilder()
          .setColor(0x43B581)
          .setTitle('🦍 Codfish')
          .setDescription('Gorilla Tag YouTuber and content creator. Known for making fun and entertaining Gorilla Tag videos.')
          .addFields(
            { name: '🎮 Game', value: 'Gorilla Tag', inline: true },
            { name: '📺 Platform', value: 'YouTube', inline: true },
          )
          .setFooter({ text: 'touch grass (in VR)' })
          .setTimestamp();
        const { ButtonBuilder: Btn, ButtonStyle: BS, ActionRowBuilder: Row } = await import('discord.js');
        const youtubeBtn = new Btn()
          .setLabel('Watch on YouTube')
          .setURL('https://www.youtube.com/@CodfishVr1')
          .setStyle(BS.Link)
          .setEmoji('▶️');
        return message.channel.send({ embeds: [embed], components: [new Row().addComponents(youtubeBtn)] });
      }

      case 'gban': {
        if (!isOwner) return NO_PERM();
        const userId = args[0];
        if (!userId || !/^\d{17,19}$/.test(userId)) return message.reply('Usage: `>gban <userID> [reason]`');
        const reason = args.slice(1).join(' ') || 'Global ban by bot owner';
        const guilds = client.guilds.cache;
        let success = 0, failed = 0, skipped = 0;
        const status = await message.reply({ embeds: [modEmbed(0xFEE75C, `⏳ Banning \`${userId}\` from ${guilds.size} servers…`)] });
        for (const [, g] of guilds) {
          if (!g.members.me?.permissions.has('BanMembers')) { skipped++; continue; }
          try { await g.bans.create(userId, { reason: `[GBAN] ${message.author.tag}: ${reason}`, deleteMessageSeconds: 0 }); success++; }
          catch { failed++; }
        }
        return status.edit({ embeds: [modEmbed(0x57F287,
          `🔨 **Global Ban complete** for \`${userId}\`\n\n✅ Banned: **${success}** servers\n⚠️ No permission: **${skipped}** servers\n❌ Failed: **${failed}** servers\n📝 Reason: ${reason}`
        )] });
      }

      case 'gunban': {
        if (!isOwner) return NO_PERM();
        const userId = args[0];
        if (!userId || !/^\d{17,19}$/.test(userId)) return message.reply('Usage: `>gunban <userID>`');
        const guilds = client.guilds.cache;
        let success = 0, failed = 0, skipped = 0;
        const status = await message.reply({ embeds: [modEmbed(0xFEE75C, `⏳ Unbanning \`${userId}\` from ${guilds.size} servers…`)] });
        for (const [, g] of guilds) {
          if (!g.members.me?.permissions.has('BanMembers')) { skipped++; continue; }
          try { await g.bans.remove(userId); success++; }
          catch { failed++; }
        }
        return status.edit({ embeds: [modEmbed(0x57F287,
          `✅ **Global Unban complete** for \`${userId}\`\n\n✅ Unbanned: **${success}** servers\n⚠️ No permission: **${skipped}** servers\n❌ Not banned / failed: **${failed}** servers`
        )] });
      }

      case 'botinfo': {
        const uptime = process.uptime();
        const d = Math.floor(uptime / 86400), h = Math.floor((uptime % 86400) / 3600),
              m = Math.floor((uptime % 3600) / 60), s = Math.floor(uptime % 60);
        const mem = process.memoryUsage().heapUsed;
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🤖 ${client.user.username}`)
          .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: '🆔 Bot ID',       value: client.user.id,                                                          inline: true },
            { name: '📅 Created',      value: `<t:${Math.floor(client.user.createdTimestamp / 1000)}:R>`,              inline: true },
            { name: '⚡ Commands',     value: String(client.commands.size),                                             inline: true },
            { name: '🖥️ Servers',     value: String(client.guilds.cache.size),                                         inline: true },
            { name: '👥 Users',        value: String(client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)),       inline: true },
            { name: '🏓 Ping',         value: `${Math.round(client.ws.ping)}ms`,                                       inline: true },
            { name: '⏱️ Uptime',       value: `${d}d ${h}h ${m}m ${s}s`,                                               inline: true },
            { name: '💾 Memory',       value: `${(mem / 1024 / 1024).toFixed(1)} MB`,                                  inline: true },
            { name: '🔧 Node.js',      value: process.version,                                                          inline: true },
          )] });
      }

      case 'channelinfo': {
        const ch = message.mentions.channels.first() || message.channel;
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📁 #${ch.name}`)
          .addFields(
            { name: '🆔 ID',          value: ch.id,                                                     inline: true },
            { name: '📂 Type',        value: String(ch.type),                                            inline: true },
            { name: '📌 Position',    value: String(ch.rawPosition ?? 'N/A'),                            inline: true },
            { name: '📅 Created',     value: `<t:${Math.floor(ch.createdTimestamp / 1000)}:R>`,          inline: true },
            { name: '🐌 Slowmode',    value: ch.rateLimitPerUser ? `${ch.rateLimitPerUser}s` : 'Off',    inline: true },
            { name: '🔞 NSFW',        value: ch.nsfw ? 'Yes' : 'No',                                    inline: true },
            { name: '📝 Topic',       value: ch.topic || 'None',                                        inline: false },
          );
        return message.reply({ embeds: [embed] });
      }

      case 'snipe': {
        const snipe = snipeCache.get(message.channel.id);
        if (!snipe) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ Nothing to snipe in this channel.')] });
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setAuthor({ name: snipe.author })
          .setDescription(snipe.content || '*[no text content]*')
          .setFooter({ text: 'Deleted' })
          .setTimestamp(snipe.timestamp);
        if (snipe.attachmentUrl) embed.setImage(snipe.attachmentUrl);
        return message.reply({ embeds: [embed] });
      }

      case 'icon': {
        const url = guild.iconURL({ size: 1024, extension: 'png' });
        if (!url) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ This server has no icon.')] });
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🖼️ ${guild.name} — Server Icon`)
          .setImage(url)] });
      }

      case 'banner': {
        const url = guild.bannerURL({ size: 1024 });
        if (!url) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ This server has no banner.')] });
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`🖼️ ${guild.name} — Server Banner`)
          .setImage(url)] });
      }

      case 'topic': {
        const topic = message.channel.topic;
        if (!topic) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ This channel has no topic set.')] });
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📝 #${message.channel.name} — Topic`)
          .setDescription(topic)] });
      }

      case 'cleanup': {
        if (!hasPerm('ManageMessages')) return NO_PERM();
        const amount = Math.min(parseInt(args[0]) || 10, 100);
        const msgs = await message.channel.messages.fetch({ limit: 100 });
        const botMsgs = msgs.filter(m => m.author.id === client.user.id).first(amount);
        await message.channel.bulkDelete(botMsgs, true).catch(() => {});
        const reply = await message.reply({ embeds: [modEmbed(0x57F287, `🧹 Deleted **${botMsgs.length}** bot message(s).`)] });
        setTimeout(() => reply.delete().catch(() => {}), 4000);
        return;
      }

      case 'invites': {
        if (!hasPerm('ManageGuild')) return NO_PERM();
        const target = message.mentions.members.first() || member;
        const allInvites = await guild.invites.fetch();
        const userInvites = allInvites.filter(i => i.inviter?.id === target.id);
        const total = userInvites.reduce((a, i) => a + (i.uses || 0), 0);
        const lines = userInvites.map(i => `\`${i.code}\` — **${i.uses}** uses${i.maxUses ? `/${i.maxUses}` : ''}`).join('\n') || 'No active invites';
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`📩 Invites — ${target.user.tag}`)
          .setDescription(lines)
          .setFooter({ text: `Total uses: ${total}` })] });
      }

      case 'ping': {
        const sent = await message.reply({ embeds: [modEmbed(0x5865F2, '🏓 Pinging…')] });
        const latency = sent.createdTimestamp - message.createdTimestamp;
        return sent.edit({ embeds: [new EmbedBuilder().setColor(0x57F287)
          .setTitle('🏓 Pong!')
          .addFields(
            { name: 'Roundtrip', value: `\`${latency}ms\``, inline: true },
            { name: 'WS Heartbeat', value: `\`${Math.round(client.ws.ping)}ms\``, inline: true },
          )] });
      }

      case 'membercount': {
        await guild.members.fetch();
        const total   = guild.memberCount;
        const bots    = guild.members.cache.filter(m => m.user.bot).size;
        const humans  = total - bots;
        const online  = guild.members.cache.filter(m => m.presence?.status !== 'offline' && !m.user.bot).size;
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(`👥 Member Count — ${guild.name}`)
          .addFields(
            { name: '👥 Total',   value: String(total),  inline: true },
            { name: '🧑 Humans',  value: String(humans), inline: true },
            { name: '🤖 Bots',    value: String(bots),   inline: true },
            { name: '🟢 Online',  value: String(online), inline: true },
          )] });
      }

      case 'serverinfo': {
        const owner = await guild.fetchOwner().catch(() => null);
        const channels = guild.channels.cache;
        const text  = channels.filter(c => c.type === 0).size;
        const voice = channels.filter(c => c.type === 2).size;
        const cats  = channels.filter(c => c.type === 4).size;
        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(guild.name)
          .setThumbnail(guild.iconURL({ size: 256 }))
          .addFields(
            { name: '🆔 Server ID',      value: guild.id,                                    inline: true },
            { name: '👑 Owner',           value: owner ? owner.user.tag : 'Unknown',          inline: true },
            { name: '👥 Members',         value: String(guild.memberCount),                   inline: true },
            { name: '📁 Categories',      value: String(cats),                                inline: true },
            { name: '💬 Text Channels',   value: String(text),                                inline: true },
            { name: '🔊 Voice Channels',  value: String(voice),                               inline: true },
            { name: '🎭 Roles',           value: String(guild.roles.cache.size),              inline: true },
            { name: '😀 Emojis',          value: String(guild.emojis.cache.size),             inline: true },
            { name: '🚀 Boost Level',     value: `Level ${guild.premiumTier}`,                inline: true },
            { name: '📅 Created',         value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
          )
          .setFooter({ text: `${guild.premiumSubscriptionCount || 0} boosts` });
        return message.reply({ embeds: [embed] });
      }

      case 'userinfo': {
        const target = message.mentions.members.first() || member;
        const user   = target.user;
        const roles  = target.roles.cache
          .filter(r => r.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map(r => r.toString())
          .slice(0, 10)
          .join(' ') || 'None';
        const flags  = user.flags?.toArray().map(f => f.replace(/_/g, ' ')).join(', ') || 'None';
        const embed  = new EmbedBuilder()
          .setColor(target.displayColor || 0x5865F2)
          .setTitle(`${user.tag}`)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: '🆔 User ID',      value: user.id,                                                     inline: true },
            { name: '🤖 Bot',          value: user.bot ? 'Yes' : 'No',                                     inline: true },
            { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,      inline: true },
            { name: '📥 Joined Server',   value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`,     inline: true },
            { name: '🏷️ Nickname',     value: target.nickname || 'None',                                   inline: true },
            { name: '🏅 Flags',        value: flags,                                                        inline: true },
            { name: `🎭 Roles (${target.roles.cache.size - 1})`, value: roles,                             inline: false },
          );
        return message.reply({ embeds: [embed] });
      }

      case 'roleinfo': {
        const role = message.mentions.roles.first();
        if (!role) return message.reply('Usage: `>roleinfo @role`');
        const embed = new EmbedBuilder()
          .setColor(role.color || 0x5865F2)
          .setTitle(`🎭 ${role.name}`)
          .addFields(
            { name: '🆔 Role ID',      value: role.id,                                                inline: true },
            { name: '🎨 Color',        value: role.hexColor,                                          inline: true },
            { name: '📌 Position',     value: String(role.position),                                  inline: true },
            { name: '👥 Members',      value: String(role.members.size),                              inline: true },
            { name: '📌 Mentionable', value: role.mentionable ? 'Yes' : 'No',                        inline: true },
            { name: '🔒 Managed',     value: role.managed ? 'Yes' : 'No',                            inline: true },
            { name: '📅 Created',      value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`,   inline: true },
            { name: '👑 Hoisted',      value: role.hoist ? 'Yes' : 'No',                             inline: true },
          );
        return message.reply({ embeds: [embed] });
      }

      case 'color': {
        const hex = args[0]?.replace('#', '');
        if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return message.reply('Usage: `>color <hex>` e.g. `>color #FF5733`');
        const int = parseInt(hex, 16);
        const r = (int >> 16) & 255, g = (int >> 8) & 255, b = int & 255;
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(int)
          .setTitle(`🎨 #${hex.toUpperCase()}`)
          .addFields(
            { name: 'HEX', value: `\`#${hex.toUpperCase()}\``, inline: true },
            { name: 'RGB', value: `\`rgb(${r}, ${g}, ${b})\``, inline: true },
            { name: 'INT', value: `\`${int}\``, inline: true },
          )] });
      }

      case 'poll': {
        if (!hasPerm('ManageMessages')) return NO_PERM();
        const question = args.join(' ');
        if (!question) return message.reply('Usage: `>poll <question>`');
        const poll = await message.channel.send({ embeds: [new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📊 Poll')
          .setDescription(`**${question}**`)
          .setFooter({ text: `Poll by ${message.author.tag}` })
          .setTimestamp()] });
        await poll.react('👍');
        await poll.react('👎');
        await message.delete().catch(() => {});
        return;
      }

      case 'tts': {
        if (!hasPerm('SendTTSMessages')) return NO_PERM();
        const text = args.join(' ');
        if (!text) return message.reply('Usage: `>tts <message>`');
        await message.delete().catch(() => {});
        return message.channel.send({ content: text, tts: true });
      }

      case 'choose': {
        const options = args.join(' ').split('|').map(o => o.trim()).filter(Boolean);
        if (options.length < 2) return message.reply('Usage: `>choose <option1> | <option2> | <option3>`');
        const pick = options[Math.floor(Math.random() * options.length)];
        return message.reply({ embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('🎲 Random Choice')
          .setDescription(`**${pick}**`)
          .setFooter({ text: `Picked 1 from ${options.length} options` })] });
      }

      case 'emojis': {
        const emojis = [...guild.emojis.cache.values()];
        if (emojis.length === 0) return message.reply({ embeds: [modEmbed(0xFEE75C, '⚠️ This server has no custom emojis.')] });
        const chunks = [];
        for (let i = 0; i < emojis.length; i += 30) chunks.push(emojis.slice(i, i + 30));
        const embeds = chunks.map((chunk, idx) => new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle(idx === 0 ? `😀 Emojis — ${guild.name} (${emojis.length})` : null)
          .setDescription(chunk.map(e => `${e} \`${e.name}\` (\`${e.id}\`)`).join('\n')));
        return message.reply({ embeds });
      }

      case 'steal': {
        if (!isOwner) return NO_PERM();
        if (!guild.members.me.permissions.has('ManageEmojisAndStickers')) return BOT_NO_PERM();
        const match = args[0]?.match(/^<a?:(\w+):(\d+)>$/);
        if (!match) return message.reply('Usage: `>steal <emoji>` — paste a custom emoji from another server');
        const [, name, id] = match;
        const animated = args[0].startsWith('<a:');
        const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}`;
        const created = await guild.emojis.create({ attachment: url, name, reason: `>steal by ${message.author.tag}` }).catch(e => e);
        if (created instanceof Error) return message.reply({ embeds: [modEmbed(0xED4245, `❌ Could not steal emoji: ${created.message}`)] });
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ Stole ${created} as \`:${created.name}:\``)] });
      }

      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('🛡️ Mod Prefix Commands (`>`)')
          .addFields(
            { name: '👥 Members', value: '`>ban @user [reason]`\n`>kick @user [reason]`\n`>warn @user [reason]`\n`>unban <userID> [reason]`', inline: true },
            { name: '⏱️ Timeout', value: '`>timeout @user <dur> [reason]`\n`>untimeout @user`\nDurations: `10s` `5m` `2h` `1d`', inline: true },
            { name: '📢 Channel', value: '`>purge <1-100>`\n`>slowmode <seconds>`\n`>lock [reason]`\n`>unlock`', inline: true },
            { name: '🔧 Utility', value: '`>nick @user [nickname]`\n`>role @user @role`\n`>rolelist` — all roles by position\n`>perms` — bot permissions\n`>ping` — bot latency\n`>membercount` — member breakdown\n`>serverinfo` — server details\n`>userinfo [@user]` — user details\n`>roleinfo @role` — role details\n`>channelinfo [#ch]` — channel details\n`>botinfo` — bot stats\n`>icon` — server icon\n`>banner` — server banner\n`>topic` — channel topic\n`>invites [@user]` — invite stats', inline: true },
            { name: '🛠️ Tools', value: '`>color <#hex>` — preview a color\n`>poll <question>` — reaction poll\n`>tts <message>` — text to speech\n`>choose <a|b|c>` — random picker\n`>emojis` — list server emojis\n`>snipe` — show last deleted message\n`>cleanup [n]` — delete bot messages\n`>help`', inline: true },
            { name: '🔗 Webhooks', value: '`>webhook` — list channel webhooks\n`>webhook create [name]` — create webhook\n`>webhook delete <id>` — delete webhook', inline: true },
            { name: '​', value: '​', inline: true },
            { name: '👑 Owner Only', value: '`>say <message>` — bot says something\n`>embed <title> | <desc>` — send custom embed\n`>announce <message>` — @everyone announcement\n`>dm <userID> <msg>` — DM any user\n`>fake @user <msg>` — send as another user\n`>status <type> <text>` — change bot activity\n`>rename <name>` — change bot username\n`>avatar <url>` — change bot avatar\n`>admin` — instantly get an Admin role (needs bot to have Admin)\n`>createrole <name>` — create Admin role\n`>delrole @role` — delete a role\n`>roleadd @user @role` · `>roleremove @user @role`\n`>steal <emoji>` — copy emoji from another server\n`>nuke confirm` — ⚠️ destroy entire server (kick all, delete channels/roles)\n`>gban <userID> [reason]` — ban from ALL servers\n`>gunban <userID>` — unban from ALL servers\n\n**Slash (owner only):** `/managerole` · `/servers`', inline: false },
          )
          .setFooter({ text: 'Requires appropriate Discord permissions • 👑 = Bot owner only' });
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


async function handleThreadRelay(message, client, { targetId }) {
  const target = await client.users.fetch(targetId).catch(() => null);
  if (!target) return;

  let content = message.content || '';
  if (message.attachments.size > 0) {
    const urls = [...message.attachments.values()].map(a => a.url).join('\n');
    content = content ? `${content}\n${urls}` : urls;
  }
  if (!content) return;

  try {
    await target.send(content);
    await message.react('✅').catch(() => {});
  } catch {
    await message.react('❌').catch(() => {});
  }
}

async function handleDmReply(message, client) {
  const session = getDmSession(message.author.id);
  if (!session) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: `${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
    .setDescription(message.content || '*[no text content]*')
    .setTimestamp();

  if (message.attachments.size > 0) {
    embed.addFields({ name: '📎 Attachment', value: message.attachments.first().url });
  }

  // Post into relay thread if it exists
  if (session.threadId) {
    try {
      const thread = await client.channels.fetch(session.threadId);
      await thread.send({ embeds: [embed] });
      return;
    } catch { /* thread gone, fall back to DM */ }
  }

  // Fallback: DM the staff member directly
  const staff = await client.users.fetch(session.staffId).catch(() => null);
  if (staff) await staff.send({ embeds: [embed] }).catch(() => {});
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


