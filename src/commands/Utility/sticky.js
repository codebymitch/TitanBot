import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const STICKY_KEY = (guildId, channelId) => `sticky_${guildId}_${channelId}`;

export async function getSticky(guildId, channelId) {
  return await getFromDb(STICKY_KEY(guildId, channelId), null);
}

export async function saveSticky(guildId, channelId, data) {
  await setInDb(STICKY_KEY(guildId, channelId), data);
}

export async function deleteSticky(guildId, channelId) {
  await setInDb(STICKY_KEY(guildId, channelId), null);
}

export default {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('Manage sticky messages in channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set a sticky message in a channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The channel to set the sticky in')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('The sticky message content')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('title')
            .setDescription('Optional title for the sticky embed')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('color')
            .setDescription('Embed color')
            .setRequired(false)
            .addChoices(
              { name: 'Yellow (default)', value: '0xF1C40F' },
              { name: 'Blue', value: '0x3498DB' },
              { name: 'Green', value: '0x2ECC71' },
              { name: 'Red', value: '0xE74C3C' },
              { name: 'Purple', value: '0x9B59B6' },
              { name: 'White', value: '0xFFFFFF' },
            )
        )
    )

    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove the sticky message from a channel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('The channel to remove the sticky from')
            .setRequired(true)
        )
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('List all sticky messages in this server')
    ),

  category: 'utility',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const sub = interaction.options.getSubcommand();

      if (sub === 'set') {
        const channel = interaction.options.getChannel('channel');
        const message = interaction.options.getString('message');
        const title = interaction.options.getString('title') || '📌 Sticky Message';
        const colorStr = interaction.options.getString('color') || '0xF1C40F';

        // Check if sticky already exists and delete old message
        const existing = await getSticky(interaction.guild.id, channel.id);
        if (existing?.messageId) {
          const oldMsg = await channel.messages.fetch(existing.messageId).catch(() => null);
          if (oldMsg) await oldMsg.delete().catch(() => {});
        }

        // Send the sticky
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(message)
          .setColor(parseInt(colorStr, 16))
          .setFooter({ text: '📌 Sticky Message' })
          .setTimestamp();

        const sentMsg = await channel.send({ embeds: [embed] });

        // Save sticky config
        await saveSticky(interaction.guild.id, channel.id, {
          channelId: channel.id,
          guildId: interaction.guild.id,
          messageId: sentMsg.id,
          message,
          title,
          color: colorStr,
          setBy: interaction.user.id,
          setAt: new Date().toISOString(),
        });

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('📌 Sticky Set', `Sticky message has been set in <#${channel.id}>.`)],
        });

      } else if (sub === 'remove') {
        const channel = interaction.options.getChannel('channel');
        const sticky = await getSticky(interaction.guild.id, channel.id);

        if (!sticky) {
          throw new TitanBotError('No sticky', ErrorTypes.USER_INPUT, `There is no sticky message in <#${channel.id}>.`, { subtype: 'not_found' });
        }

        // Delete the sticky message
        if (sticky.messageId) {
          const msg = await channel.messages.fetch(sticky.messageId).catch(() => null);
          if (msg) await msg.delete().catch(() => {});
        }

        await deleteSticky(interaction.guild.id, channel.id);

        await InteractionHelper.universalReply(interaction, {
          embeds: [successEmbed('🗑️ Sticky Removed', `Sticky message has been removed from <#${channel.id}>.`)],
        });

      } else if (sub === 'list') {
        // Scan all channels for stickies
        const stickies = [];
        for (const [, channel] of interaction.guild.channels.cache) {
          const sticky = await getSticky(interaction.guild.id, channel.id);
          if (sticky) stickies.push(sticky);
        }

        if (stickies.length === 0) {
          return InteractionHelper.universalReply(interaction, {
            embeds: [new EmbedBuilder().setColor(0x3498DB).setDescription('No sticky messages are set in this server.')],
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle('📌 Sticky Messages')
          .setDescription(stickies.map(s =>
            `<#${s.channelId}> — **${s.title}**\n> ${s.message.length > 80 ? s.message.slice(0, 80) + '…' : s.message}`
          ).join('\n\n'))
          .setFooter({ text: `${stickies.length} sticky message(s)` })
          .setTimestamp();

        await InteractionHelper.universalReply(interaction, { embeds: [embed] });
      }

    } catch (error) {
      logger.error('Sticky command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'sticky_failed' });
    }
  },
};
