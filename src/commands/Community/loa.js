import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const LOA_FORUM_CHANNEL_ID = '1517999241182576710';
const LOA_ROLE_ID = '1513775663834992730';

function generateLoaId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default {
  data: new SlashCommandBuilder()
    .setName('loa')
    .setDescription('Leave of Absence request system')

    // /loa request
    .addSubcommand(sub =>
      sub.setName('request')
        .setDescription('Submit a Leave of Absence request')
        .addStringOption(opt =>
          opt.setName('start_date')
            .setDescription('Start date of your LOA (e.g. June 20, 2026)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('end_date')
            .setDescription('Expected return date (e.g. June 27, 2026)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('reason')
            .setDescription('Reason for your LOA')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('notes')
            .setDescription('Any additional notes')
            .setRequired(false)
        )
    )

    // /loa return
    .addSubcommand(sub =>
      sub.setName('return')
        .setDescription('Mark yourself as returned from LOA')
    )

    // /loa view
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View your current LOA status')
    )

    // /loa list (staff only)
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all active LOAs (staff only)')
    ),

  category: 'community',

  async execute(interaction, config, client) {
    try {
      const sub = interaction.options.getSubcommand();

      if (sub === 'request') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const startDate = interaction.options.getString('start_date');
        const endDate = interaction.options.getString('end_date');
        const reason = interaction.options.getString('reason');
        const notes = interaction.options.getString('notes') || 'None';

        // Check if user already has an active LOA
        const existingLoa = await getFromDb(`loa_active_${interaction.guild.id}_${interaction.user.id}`, null);
        if (existingLoa) {
          throw new TitanBotError('Active LOA exists', ErrorTypes.USER_INPUT, 'You already have an active LOA request. Use `/loa view` to check its status.', { subtype: 'duplicate_loa' });
        }

        const loaId = generateLoaId();
        const now = new Date();

        // Build the LOA embed
        const embed = new EmbedBuilder()
          .setTitle(`LOA Request — \`${loaId}\``)
          .setColor(0xF39C12)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 128 }))
          .addFields(
            { name: 'Member', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: false },
            { name: 'Start Date', value: startDate, inline: true },
            { name: 'Return Date', value: endDate, inline: true },
            { name: 'Submitted', value: `<t:${Math.floor(now.getTime() / 1000)}:F>`, inline: false },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Additional Notes', value: notes, inline: false },
            { name: 'Status', value: '🟡 **Pending Review**', inline: false },
          )
          .setTimestamp();

        // Approval buttons
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`loa_approve_${loaId}_${interaction.user.id}`)
            .setLabel('✅ Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`loa_deny_${loaId}_${interaction.user.id}`)
            .setLabel('❌ Deny')
            .setStyle(ButtonStyle.Danger),
        );

        // Post to LOA forum channel
        const forumChannel = interaction.guild.channels.cache.get(LOA_FORUM_CHANNEL_ID)
          || await interaction.guild.channels.fetch(LOA_FORUM_CHANNEL_ID).catch(() => null);

        if (!forumChannel) {
          throw new TitanBotError('Forum not found', ErrorTypes.CONFIGURATION, 'LOA forum channel not found.', { subtype: 'missing_channel' });
        }

        const forumPost = await forumChannel.threads.create({
          name: `LOA — ${interaction.user.username} — ${loaId}`,
          message: {
            embeds: [embed],
            components: [buttons],
          },
        });

        // Store the LOA request
        await setInDb(`loa_active_${interaction.guild.id}_${interaction.user.id}`, {
          loaId,
          userId: interaction.user.id,
          startDate,
          endDate,
          reason,
          notes,
          status: 'pending',
          threadId: forumPost.id,
          submittedAt: now.toISOString(),
        });

        // Store by loaId for lookup
        await setInDb(`loa_id_${interaction.guild.id}_${loaId}`, interaction.user.id);

        await InteractionHelper.universalReply(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0xF39C12)
              .setTitle('📋 LOA Request Submitted')
              .setDescription(`Your LOA request (\`${loaId}\`) has been submitted for review!\n\nYou'll be notified once it's approved or denied.`)
              .addFields(
                { name: 'Start Date', value: startDate, inline: true },
                { name: 'Return Date', value: endDate, inline: true },
              )
              .setTimestamp(),
          ],
        });

      } else if (sub === 'return') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const loa = await getFromDb(`loa_active_${interaction.guild.id}_${interaction.user.id}`, null);
        if (!loa) {
          throw new TitanBotError('No active LOA', ErrorTypes.USER_INPUT, 'You don\'t have an active LOA.', { subtype: 'no_loa' });
        }

        // Remove the LOA role
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (member) {
          await member.roles.remove(LOA_ROLE_ID).catch(() => {});
        }

        // Update status
        loa.status = 'returned';
        loa.returnedAt = new Date().toISOString();
        await setInDb(`loa_active_${interaction.guild.id}_${interaction.user.id}`, null);
        await setInDb(`loa_returned_${interaction.guild.id}_${interaction.user.id}_${loa.loaId}`, loa);

        // Update forum thread if possible
        if (loa.threadId) {
          const thread = interaction.guild.channels.cache.get(loa.threadId)
            || await interaction.guild.channels.fetch(loa.threadId).catch(() => null);
          if (thread) {
            await thread.send({
              embeds: [
                new EmbedBuilder()
                  .setColor(0x2ECC71)
                  .setDescription(`✅ <@${interaction.user.id}> has returned from LOA on <t:${Math.floor(Date.now() / 1000)}:F>.`)
              ]
            }).catch(() => {});
            await thread.setArchived(true).catch(() => {});
          }
        }

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('✅ Welcome Back!', 'Your LOA has been marked as complete and your LOA role has been removed.')],
        });

      } else if (sub === 'view') {
        const loa = await getFromDb(`loa_active_${interaction.guild.id}_${interaction.user.id}`, null);
        if (!loa) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription('You have no active LOA request.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const statusEmoji = { pending: '🟡', approved: '🟢', denied: '🔴', returned: '⚪' }[loa.status] || '🟡';

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`Your LOA — \`${loa.loaId}\``)
          .addFields(
            { name: 'Status', value: `${statusEmoji} ${loa.status.charAt(0).toUpperCase() + loa.status.slice(1)}`, inline: true },
            { name: 'Start Date', value: loa.startDate, inline: true },
            { name: 'Return Date', value: loa.endDate, inline: true },
            { name: 'Reason', value: loa.reason, inline: false },
            { name: 'Notes', value: loa.notes || 'None', inline: false },
            { name: 'Submitted', value: `<t:${Math.floor(new Date(loa.submittedAt).getTime() / 1000)}:R>`, inline: false },
          )
          .setTimestamp();

        await InteractionHelper.universalReply(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });

      } else if (sub === 'list') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          throw new TitanBotError('No permission', ErrorTypes.PERMISSIONS, 'You need Manage Roles permission to view all LOAs.', { subtype: 'missing_permission' });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Get all active LOAs for this guild — scan known pattern
        const loas = [];
        for (const [, member] of interaction.guild.members.cache) {
          const loa = await getFromDb(`loa_active_${interaction.guild.id}_${member.id}`, null);
          if (loa) loas.push(loa);
        }

        if (loas.length === 0) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription('No active LOAs at this time.')],
          });
        }

        const statusEmoji = { pending: '🟡', approved: '🟢', denied: '🔴' };

        const embed = new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle('📋 Active LOAs')
          .setDescription(
            loas.map(l =>
              `${statusEmoji[l.status] || '🟡'} <@${l.userId}> — \`${l.loaId}\` — **${l.startDate}** to **${l.endDate}**`
            ).join('\n')
          )
          .setFooter({ text: `${loas.length} active LOA(s)` })
          .setTimestamp();

        await InteractionHelper.universalReply(interaction, { embeds: [embed] });
      }

    } catch (error) {
      logger.error('LOA command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'loa_failed' });
    }
  },
};
