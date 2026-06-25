import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { logModerationAction, generateCaseId, storeModerationCase } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';

const PUNISHMENT_LOG_CHANNEL_ID = '1517145309015314442';
const WARNING_ROLE_ID = '1519540353881866404';
const MUTED_ROLE_ID = '1480276327578996747';
const SUSPENSION_ROLE_ID = '1480276327578996747';

const PUNISHMENT_TYPES = [
  'Verbal Warning',
  'Written Warning',
  'Mute/Timeout',
  'Kick',
  'Temporary Ban',
  'Permanent Ban',
  'Termination',
  'Demotion',
  'Suspension',
];

async function executePunishmentAction(member, punishmentType, durationStr, guild) {
  const results = [];

  try {
    switch (punishmentType) {
      case 'Verbal Warning':
      case 'Written Warning': {
        // Add warning role
        try {
          await member.roles.add(WARNING_ROLE_ID);
          results.push(`✅ Warning role added`);
        } catch (roleErr) {
          results.push(`❌ Failed to add warning role: ${roleErr.message}`);
        }
        break;
      }

      case 'Mute/Timeout':
      case 'Temporary Ban': {
        // Add muted role
        try {
          await member.roles.add(MUTED_ROLE_ID);
          results.push(`✅ Muted role added`);
        } catch (roleErr) {
          results.push(`❌ Failed to add muted role: ${roleErr.message}`);
        }

        // Schedule role removal if duration provided
        if (durationStr) {
          const ms = parseDuration(durationStr);
          if (ms) {
            setTimeout(async () => {
              try {
                const freshMember = await guild.members.fetch(member.id).catch(() => null);
                if (freshMember) {
                  await freshMember.roles.remove(MUTED_ROLE_ID).catch(() => {});
                }
              } catch (err) {}
            }, ms);
            results.push(`⏰ Muted role will be removed after ${formatDuration(durationStr)}`);
          }
        }
        break;
      }

      case 'Kick': {
        await member.kick().catch(() => {});
        results.push(`✅ Member kicked`);
        break;
      }

      case 'Permanent Ban':
      case 'Termination': {
        // Add muted role permanently
        try {
          await member.roles.add(MUTED_ROLE_ID);
          results.push(`✅ Muted role added permanently`);
        } catch (roleErr) {
          results.push(`❌ Failed to add muted role: ${roleErr.message}`);
        }
        break;
      }

      case 'Suspension': {
        // Add suspension role
        try {
          await member.roles.add(SUSPENSION_ROLE_ID);
          results.push(`✅ Suspension role added`);
        } catch (roleErr) {
          results.push(`❌ Failed to add suspension role: ${roleErr.message}`);
        }

        // Schedule role removal if duration provided
        if (durationStr) {
          const ms = parseDuration(durationStr);
          if (ms) {
            setTimeout(async () => {
              try {
                const freshMember = await guild.members.fetch(member.id).catch(() => null);
                if (freshMember) {
                  await freshMember.roles.remove(SUSPENSION_ROLE_ID).catch(() => {});
                }
              } catch (err) {}
            }, ms);
            results.push(`⏰ Suspension role will be removed after ${formatDuration(durationStr)}`);
          }
        }
        break;
      }

      case 'Demotion': {
        results.push(`📝 Demotion logged`);
        break;
      }
    }
  } catch (err) {
    results.push(`⚠️ Action partially failed: ${err.message}`);
  }

  return results;
}

function generateCaseCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function parseDuration(durationStr) {
  if (!durationStr) return null;
  const match = durationStr.match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
  return value * multipliers[unit];
}

function formatDuration(durationStr) {
  if (!durationStr) return null;
  const match = durationStr.match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) return durationStr;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const labels = { s: 'Second', m: 'Minute', h: 'Hour', d: 'Day', w: 'Week' };
  return `${value} ${labels[unit]}${value !== 1 ? 's' : ''}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('punish')
    .setDescription('Issue a punishment and log it to the punishment channel')
    .addUserOption(option =>
      option.setName('member').setDescription('The member to punish').setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Type of punishment')
        .setRequired(true)
        .addChoices(
          ...PUNISHMENT_TYPES.map(t => ({ name: t, value: t }))
        )
    )
    .addStringOption(option =>
      option.setName('reason').setDescription('Reason for the punishment').setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('duration')
        .setDescription('Duration (e.g. 30d, 7d, 24h, 1w) — leave blank for permanent')
        .setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('evidence1').setDescription('Evidence image #1').setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('evidence2').setDescription('Evidence image #2').setRequired(false)
    )
    .addAttachmentOption(option =>
      option.setName('evidence3').setDescription('Evidence image #3').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const member = interaction.options.getMember('member');
      const user = interaction.options.getUser('member');
      const punishmentType = interaction.options.getString('type');
      const reason = interaction.options.getString('reason');
      const durationStr = interaction.options.getString('duration');
      const evidence1 = interaction.options.getAttachment('evidence1');
      const evidence2 = interaction.options.getAttachment('evidence2');
      const evidence3 = interaction.options.getAttachment('evidence3');

      if (!user) {
        throw new TitanBotError('Missing target member', ErrorTypes.USER_INPUT, 'You must specify a member to punish.', { subtype: 'invalid_user' });
      }

      if (user.id === interaction.user.id) {
        throw new TitanBotError('Self punishment', ErrorTypes.USER_INPUT, 'You cannot punish yourself.', { subtype: 'self_action' });
      }

      if (user.id === client.user.id) {
        throw new TitanBotError('Bot punishment', ErrorTypes.USER_INPUT, 'You cannot punish the bot.', { subtype: 'bot_action' });
      }

      // Validate duration format if provided
      const cleanDuration = durationStr?.trim() || null;
      if (cleanDuration && !parseDuration(cleanDuration)) {
        throw new TitanBotError('Invalid duration', ErrorTypes.USER_INPUT, 'Invalid duration format. Use formats like `30d`, `7d`, `24h`, `1w`, `30m`.', { subtype: 'invalid_duration' });
      }

      // Execute the punishment action
      let actionResults = [];
      if (member) {
        actionResults = await executePunishmentAction(member, punishmentType, cleanDuration, interaction.guild);
      } else {
        actionResults = ['⚠️ Member not found in server — action skipped, log created'];
      }

      const caseCode = generateCaseCode();
      const now = new Date();
      const formattedDate = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
      });

      // Calculate expiry if duration provided
      let expiresText = null;
      if (cleanDuration) {
        const ms = parseDuration(cleanDuration);
        const expiryDate = new Date(now.getTime() + ms);
        expiresText = expiryDate.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
        });
      }

      const evidenceAttachments = [evidence1, evidence2, evidence3].filter(Boolean);

      // Build the punishment embed
      const embed = new EmbedBuilder()
        .setTitle(`Punishment Log - Case \`${caseCode}\``)
        .setColor(0xE74C3C)
        .addFields(
          {
            name: 'Member',
            value: `<@${user.id}> (\`${user.id}\`)`,
            inline: false,
          },
          {
            name: 'Issued by',
            value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`,
            inline: false,
          },
          {
            name: 'Issued',
            value: formattedDate,
            inline: false,
          },
          {
            name: 'Punishment Issued',
            value: `**${punishmentType.toUpperCase()}**`,
            inline: false,
          },
          {
            name: 'Reason',
            value: reason,
            inline: false,
          },
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
        .setTimestamp();

      if (actionResults.length > 0) {
        embed.addFields({
          name: 'Actions Taken',
          value: actionResults.join('\n'),
          inline: false,
        });
      }

      if (cleanDuration) {
        embed.addFields(
          { name: 'Active For', value: formatDuration(cleanDuration), inline: true },
          { name: 'Expires', value: expiresText, inline: true },
        );
      } else {
        embed.addFields({ name: 'Duration', value: 'Permanent', inline: false });
      }

      if (evidenceAttachments.length > 0) {
        embed.addFields({
          name: 'Evidence',
          value: evidenceAttachments.map((att, i) => `[Image ${i + 1}](${att.url})`).join(' · '),
          inline: false,
        });
        // Set first image as the embed image
        embed.setImage(evidenceAttachments[0].url);
      }

      // Build status buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`punish_reviewed_${caseCode}`)
          .setLabel('✅ Reviewed by Management')
          .setStyle(ButtonStyle.Success),
      );

      // Send to punishment log forum channel
      let logChannel = interaction.guild.channels.cache.get(PUNISHMENT_LOG_CHANNEL_ID);
      if (!logChannel) {
        logChannel = await interaction.guild.channels.fetch(PUNISHMENT_LOG_CHANNEL_ID).catch((err) => {
          logger.error(`Fetch failed: ${err.message}`);
          return null;
        });
      }
      if (!logChannel) {
        throw new TitanBotError('Log channel not found', ErrorTypes.CONFIGURATION, 'Punishment log channel not found. Please check the channel ID.', { subtype: 'missing_channel' });
      }

      // Create a new forum post for this punishment case
      const forumPost = await logChannel.threads.create({
        name: `Case ${caseCode} — ${user.username} — ${punishmentType}`,
        message: {
          embeds: [embed],
          components: [buttons],
          files: evidenceAttachments.length > 0
            ? evidenceAttachments.map(att => att.url)
            : [],
        },
      });

      const logMessage = forumPost.messages.cache.first() || { id: forumPost.id };

      // Store the case in the database
      await storeModerationCase({
        guildId: interaction.guild.id,
        caseId: caseCode,
        caseData: {
          action: punishmentType,
          target: `${user.tag} (${user.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          duration: cleanDuration ? formatDuration(cleanDuration) : 'Permanent',
          metadata: {
            userId: user.id,
            moderatorId: interaction.user.id,
            caseCode,
            messageId: logMessage.id,
            channelId: PUNISHMENT_LOG_CHANNEL_ID,
            evidenceUrls: evidenceAttachments.map(a => a.url),
          },
        },
      });

      // Log to audit system
      await logModerationAction({
        client,
        guild: interaction.guild,
        event: {
          action: punishmentType,
          target: `${user.tag} (${user.id})`,
          executor: `${interaction.user.tag} (${interaction.user.id})`,
          reason,
          duration: cleanDuration ? formatDuration(cleanDuration) : null,
          caseId: caseCode,
          metadata: {
            userId: user.id,
            moderatorId: interaction.user.id,
          },
        },
      });

      await InteractionHelper.universalReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('✅ Punishment Logged')
            .setDescription(`Case \`${caseCode}\` has been created and logged to <#${PUNISHMENT_LOG_CHANNEL_ID}>.`)
            .addFields(
              { name: 'Member', value: `<@${user.id}>`, inline: true },
              { name: 'Type', value: punishmentType, inline: true },
              { name: 'Reason', value: reason, inline: false },
            )
            .setTimestamp(),
        ],
      });

    } catch (error) {
      logger.error('Punish command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'punish_failed' });
    }
  },
};