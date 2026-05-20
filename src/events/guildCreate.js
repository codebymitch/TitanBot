import { Events, PermissionsBitField } from 'discord.js';
import { isGuildApproved } from '../services/accessService.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import { t, pickLanguage } from '../services/i18n.js';
import { getGuildConfig } from '../services/guildConfigService.js';

export default {
  name: Events.GuildCreate,

  async execute(guild, client) {
    try {
      const approved = await isGuildApproved(client.db, guild.id);
      if (approved) {
        logger.info(`Joined approved guild ${guild.name} (${guild.id})`);
        return;
      }

      const brand = botConfig.brand?.name || 'Wolf';
      logger.info(`Joined NON-approved guild ${guild.name} (${guild.id}) — pending owner approval`);

      const me = guild.members.me;
      const canSend = (ch) =>
        ch &&
        ch.isTextBased?.() &&
        ch.permissionsFor(me)?.has(PermissionsBitField.Flags.SendMessages) &&
        ch.permissionsFor(me)?.has(PermissionsBitField.Flags.EmbedLinks);

      let channel = guild.systemChannel && canSend(guild.systemChannel) ? guild.systemChannel : null;
      if (!channel) {
        channel = guild.channels.cache
          .filter((c) => canSend(c))
          .sort((a, b) => a.rawPosition - b.rawPosition)
          .first();
      }
      if (!channel) return;

      const dashboardUrl = botConfig.brand?.dashboardUrl || process.env.DASHBOARD_URL || '';
      const supportInvite = botConfig.brand?.supportInvite || '';
      const logoUrl = dashboardUrl
        ? `${dashboardUrl.replace(/\/$/, '')}${botConfig.brand?.logoPath || '/assets/logo.png'}`
        : null;

      const config = await getGuildConfig(client.db, guild.id).catch(() => ({}));
      const lang = pickLanguage(config, guild);

      const activateValue = supportInvite
        ? t(lang, 'wolf.access.pending.howWithSupport', { support: supportInvite })
        : t(lang, 'wolf.access.pending.howWithoutSupport');

      await channel.send({
        embeds: [{
          color: 0xf5b942,
          title: t(lang, 'wolf.access.pending.title', { brand }),
          description: t(lang, 'wolf.access.pending.description', { brand }),
          thumbnail: logoUrl ? { url: logoUrl } : undefined,
          fields: [
            { name: t(lang, 'wolf.access.pending.howLabel'), value: activateValue },
            { name: t(lang, 'wolf.access.pending.serverIdLabel'), value: `\`${guild.id}\`` },
            ...(dashboardUrl ? [{ name: t(lang, 'wolf.access.pending.panelLabel'), value: dashboardUrl }] : []),
          ],
          footer: { text: brand },
        }],
      }).catch(() => {});
    } catch (error) {
      logger.error('guildCreate handler error:', error);
    }
  },
};
