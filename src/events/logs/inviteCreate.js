import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.InviteCreate,

  async execute(invite, client) {
    const guild = invite.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'invite.create')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    const embed = createLogEmbed({
      title: '🔗 Invitación Creada',
      color: '#2ecc71',
      fields: [
        { name: '🔗 Código', value: `\`${invite.code}\``, inline: true },
        {
          name: '👤 Creada por',
          value: invite.inviter ? `${invite.inviter.tag}\n🆔 \`${invite.inviter.id}\`` : 'Desconocido',
          inline: true,
        },
        {
          name: '💬 Canal',
          value: invite.channel ? `${invite.channel}` : 'Desconocido',
          inline: true,
        },
        {
          name: '⏳ Expira',
          value: invite.maxAge ? `<t:${Math.floor((Date.now() + invite.maxAge * 1000) / 1000)}:R>` : 'Nunca',
          inline: true,
        },
        {
          name: '🔢 Usos máx.',
          value: invite.maxUses ? `${invite.maxUses}` : 'Ilimitados',
          inline: true,
        },
        {
          name: '👋 Temporal',
          value: invite.temporary ? 'Sí' : 'No',
          inline: true,
        },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
