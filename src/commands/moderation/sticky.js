import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  getStickyMessage,
  publishStickyMessage,
  removeStickyMessage,
  saveStickyMessage,
} from '../../services/stickyMessageService.js';

const targetChannel = interaction => interaction.options.getChannel('channel') || interaction.channel;
const ephemeral = content => ({ content, flags: MessageFlags.Ephemeral });

export default {
  data: new SlashCommandBuilder()
    .setName('sticky')
    .setDescription('ניהול הודעה שנשארת בתחתית הערוץ')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(subcommand => subcommand
      .setName('set')
      .setDescription('יצירה או עדכון של הודעה מוצמדת')
      .addStringOption(option => option
        .setName('message')
        .setDescription('תוכן ההודעה המוצמדת')
        .setRequired(true)
        .setMaxLength(2000))
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('הערוץ להגדרה; ברירת המחדל היא הערוץ הנוכחי')
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand => subcommand
      .setName('view')
      .setDescription('הצגת ההודעה המוצמדת הנוכחית')
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('הערוץ לבדיקה')
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(subcommand => subcommand
      .setName('remove')
      .setDescription('הסרת ההודעה המוצמדת')
      .addChannelOption(option => option
        .setName('channel')
        .setDescription('הערוץ שממנו תוסר ההודעה')
        .addChannelTypes(ChannelType.GuildText))),

  async execute(interaction, client) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply(ephemeral('אין לך הרשאה לנהל הודעות מוצמדות.'));
    }

    const channel = targetChannel(interaction);
    if (!channel?.isTextBased()) return interaction.reply(ephemeral('הערוץ שנבחר אינו ערוץ טקסט.'));

    const action = interaction.options.getSubcommand();
    if (action === 'view') {
      const sticky = await getStickyMessage(client, interaction.guildId, channel.id);
      return interaction.reply(ephemeral(sticky?.content
        ? `ההודעה המוצמדת ב־${channel}:\n\n${sticky.content}`
        : `אין הודעה מוצמדת ב־${channel}.`));
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (action === 'remove') {
      const sticky = await removeStickyMessage(client, interaction.guildId, channel.id);
      if (sticky?.lastMessageId) {
        const message = await channel.messages.fetch(sticky.lastMessageId).catch(() => null);
        if (message) await message.delete().catch(() => {});
      }
      return interaction.editReply(sticky
        ? `ההודעה המוצמדת הוסרה מ־${channel}.`
        : `לא הייתה הודעה מוצמדת ב־${channel}.`);
    }

    const previous = await getStickyMessage(client, interaction.guildId, channel.id);
    const sticky = {
      content: interaction.options.getString('message', true),
      lastMessageId: previous?.lastMessageId || null,
      messagesSinceLastPost: 0,
      updatedBy: interaction.user.id,
      updatedAt: Date.now(),
    };
    await saveStickyMessage(client, interaction.guildId, channel.id, sticky);
    await publishStickyMessage(client, channel, sticky);
    return interaction.editReply(`ההודעה המוצמדת נשמרה ב־${channel}.`);
  },
};
