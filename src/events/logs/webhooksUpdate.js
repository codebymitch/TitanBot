import { Events, AuditLogEvent } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { resolveLogChannel } from '../../utils/logChannel.js';
import { fetchExecutor, executorText } from '../../utils/auditLog.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.WebhooksUpdate,

  async execute(channel, client) {
    const guild = channel?.guild;
    if (!guild) return;

    const config = await getGuildConfig(client.db, guild.id);
    if (!isEventEnabled(config, 'webhook.update')) return;

    const logChannel = await resolveLogChannel(guild, config, null);
    if (!logChannel) return;

    // Discord only tells us "webhooks changed in this channel"; the audit
    // log says whether it was a create/update/delete and by whom.
    let executor = await fetchExecutor(guild, AuditLogEvent.WebhookCreate, {});
    let action = 'creado';
    if (!executor) {
      executor = await fetchExecutor(guild, AuditLogEvent.WebhookDelete, {});
      action = 'eliminado';
    }
    if (!executor) {
      executor = await fetchExecutor(guild, AuditLogEvent.WebhookUpdate, {});
      action = 'actualizado';
    }

    const embed = createLogEmbed({
      title: '🪝 Webhooks Modificados',
      color: '#9b59b6',
      fields: [
        { name: '💬 Canal', value: `${channel}\n🆔 \`${channel.id}\``, inline: true },
        { name: '🔧 Acción', value: executor ? `Webhook ${action}` : 'Webhook modificado', inline: true },
        { name: '🧑‍💼 Por', value: executorText(executor), inline: false },
      ],
      footer: `Servidor: ${guild.name}`,
    });

    await logChannel.send({ embeds: [embed] });
  },
};
