import { MessageFlags } from 'discord.js';
import { patchGuildConfig } from '../../services/guildConfigService.js';
import { t } from '../../services/i18n.js';
import { logger } from '../../utils/logger.js';

export default {
  name: 'wolf_lang',

  async execute(interaction, client, args) {
    const choice = (args?.[0] || '').toLowerCase();
    const lang = choice === 'en' ? 'en' : 'es';
    const langName = lang === 'en' ? 'English' : 'Español';

    try {
      if (interaction.guildId) {
        await patchGuildConfig(client.db, interaction.guildId, { language: lang });
      }
      await interaction.reply({
        embeds: [{
          color: 0x22c55e,
          description: t(lang, 'wolf.setup.langSet', { language: langName }),
        }],
        flags: MessageFlags.Ephemeral,
      });
    } catch (err) {
      logger.error('wolf_lang button failed', { error: err?.message });
      await interaction.reply({
        content: '❌',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};
