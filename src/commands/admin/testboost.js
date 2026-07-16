import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { AccessLevel, requireAccess } from '../../modules/community/permissions.js';
import { BOOST_GUILD_ID, buildBoostPayload, canSendBoostMessage, getBoostChannel } from '../../events/guildMemberUpdate.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('testboost')
    .setDescription('בדיקת הודעת התודה על Server Boost')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    if (!await requireAccess(interaction, client, AccessLevel.ADMIN)) return;
    if (interaction.guildId !== BOOST_GUILD_ID) {
      return interaction.reply({ content: 'פקודת הבדיקה זמינה רק בשרת EditIL.', flags: MessageFlags.Ephemeral });
    }
    const channel = getBoostChannel(interaction.guild);
    if (!channel) return interaction.reply({ content: 'ערוץ הבוסטים שהוגדר לא נמצא.', flags: MessageFlags.Ephemeral });
    if (!canSendBoostMessage(channel, interaction.guild)) {
      return interaction.reply({ content: 'לבוט חסרות הרשאות צפייה, שליחה או Embed בערוץ הבוסטים.', flags: MessageFlags.Ephemeral });
    }
    try {
      await channel.send(buildBoostPayload(interaction.member, { test: true }));
      logger.info('Boost announcement test sent', { guildId: interaction.guildId, channelId: channel.id, userId: interaction.user.id });
      return interaction.reply({ content: `הודעת בדיקת הבוסט נשלחה בהצלחה ל־${channel}.`, flags: MessageFlags.Ephemeral });
    } catch (error) {
      logger.error('Failed to send boost announcement test', { guildId: interaction.guildId, userId: interaction.user.id, error: error.stack || error.message });
      return interaction.reply({ content: 'שליחת הודעת הבדיקה נכשלה. השגיאה נרשמה ביומן.', flags: MessageFlags.Ephemeral });
    }
  }
};
