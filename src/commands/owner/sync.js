import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { registerCommands } from '../../handlers/commandLoader.js';
import { requireAccess, AccessLevel } from '../../modules/community/permissions.js';

export default {
  data: new SlashCommandBuilder().setName('sync').setDescription('Sync application commands').setDMPermission(false)
    .addBooleanOption(o => o.setName('global').setDescription('Sync globally; defaults to this test server')),
  async execute(interaction, client) {
    if (!await requireAccess(interaction, client, AccessLevel.OWNER)) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const global = interaction.options.getBoolean('global') || false;
    try {
      await registerCommands(client, global ? undefined : interaction.guildId);
      await interaction.editReply(`סונכרנו **${client.commands.size}** פקודות ${global ? 'באופן גלובלי' : 'לשרת הנוכחי'}.`);
    } catch {
      await interaction.editReply('סנכרון הפקודות נכשל. השגיאה הטכנית נרשמה לבדיקה.');
    }
  }
};
