import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

const NEW_ACCOUNT_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  name: Events.GuildMemberAdd,

  async execute(member, client) {
    const guild = member.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'member.join')) return;

    const logChannel = await resolveLogChannel(guild, config, 'member');
    if (!logChannel) return;

    const accountAge = Date.now() - member.user.createdTimestamp;
    const isNew = accountAge < NEW_ACCOUNT_MS;

    const fields = [
      {
        name: '👤 Usuario',
        value: `${member.user.tag}\n${member.user}\n🆔 \`${member.id}\``,
        inline: true,
      },
      {
        name: '👥 Miembros',
        value: `${guild.memberCount}`,
        inline: true,
      },
      {
        name: '📅 Cuenta creada',
        value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>${isNew ? '\n⚠️ **Cuenta nueva**' : ''}`,
        inline: true,
      },
    ];

    const embed = createLogEmbed({
      title: '👋 Miembro Entró',
      color: isNew ? '#FFA500' : '#2ecc71',
      user: member.user,
      thumbnail: member.user.displayAvatarURL({ dynamic: true }),
      fields,
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
