import { Events, PermissionsBitField } from 'discord.js';
import { isGuildApproved } from '../services/accessService.js';
import { botConfig } from '../config/bot.js';
import { logger } from '../utils/logger.js';

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

      await channel.send({
        embeds: [{
          color: 0xf5b942,
          title: `🔒 ${brand} está pendiente de activación`,
          description:
            `¡Gracias por añadir **${brand}**! Este servidor todavía **no está activado**, ` +
            'así que los comandos estarán bloqueados hasta que el dueño del bot conceda acceso.',
          fields: [
            { name: '📋 Para activarlo', value: 'Comparte el ID de este servidor con el dueño del bot y pídele que lo active.' },
            { name: '🆔 ID de este servidor', value: `\`${guild.id}\`` },
            ...(dashboardUrl ? [{ name: '🌐 Panel', value: dashboardUrl }] : []),
          ],
          footer: { text: brand },
        }],
      }).catch(() => {});
    } catch (error) {
      logger.error('guildCreate handler error:', error);
    }
  },
};
