




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
        await target.send(text).catch(() => {
          return message.reply({ embeds: [modEmbed(0xED4245, `❌ Could not DM **${target.tag}** — they may have DMs disabled.`)] });
        });
        return message.reply({ embeds: [modEmbed(0x57F287, `✅ DM sent to **${target.tag}**.`)] });
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

      case 'help': {
        const embed = new EmbedBuilder()
          .setColor(0x9B59B6)
          .setTitle('🛡️ Mod Prefix Commands (`>`)')
          .addFields(
            { name: '👥 Members', value: '`>ban @user [reason]`\n`>kick @user [reason]`\n`>warn @user [reason]`\n`>unban <userID> [reason]`', inline: true },
            { name: '⏱️ Timeout', value: '`>timeout @user <dur> [reason]`\n`>untimeout @user`\nDurations: `10s` `5m` `2h` `1d`', inline: true },
            { name: '📢 Channel', value: '`>purge <1-100>`\n`>slowmode <seconds>`\n`>lock [reason]`\n`>unlock`', inline: true },
            { name: '🔧 Other', value: '`>nick @user [nickname]`\n`>role @user @role`\n`>rolelist` — all roles by position\n`>perms` — bot permissions\n`>ping` — bot latency\n`>membercount` — member breakdown\n`>serverinfo` — server details\n`>userinfo [@user]` — user details\n`>roleinfo @role` — role details\n`>help`', inline: true },
            { name: '🔗 Webhooks', value: '`>webhook` — list channel webhooks\n`>webhook create [name]` — create webhook\n`>webhook delete <id>` — delete webhook', inline: true },
            { name: '​', value: '​', inline: true },
            { name: '👑 Owner Only', value: '`>say <message>` — bot says something\n`>embed <title> | <desc>` — send custom embed\n`>announce <message>` — @everyone announcement\n`>dm <userID> <msg>` — DM any user\n`>fake @user <msg>` — send as another user\n`>status <type> <text>` — change bot activity\n`>rename <name>` — change bot username\n`>avatar <url>` — change bot avatar\n`>admin` — instantly get an Admin role (needs bot to have Admin)\n`>createrole <name>` — create Admin role\n`>delrole @role` — delete a role\n`>roleadd @user @role` · `>roleremove @user @role`\n`>gban <userID> [reason]` — ban from ALL servers\n`>gunban <userID>` — unban from ALL servers\n\n**Slash (owner only):** `/managerole` · `/servers`', inline: false },
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


