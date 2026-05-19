import { Events } from 'discord.js';
import { getGuildConfig } from '../../services/guildConfigService.js';
import { isEventEnabled } from '../../services/loggingService.js';
import { createLogEmbed } from '../../utils/logEmbed.js';

export default {
  name: Events.MessageUpdate,

  async execute(oldMessage, newMessage, client) {

    // ❌ ignorar basura
    if (!oldMessage.guild) return;
    if (oldMessage.author?.bot) return;
    if (!oldMessage.content || !newMessage.content) return;
    if (oldMessage.content === newMessage.content) return;

    const config = await getGuildConfig(
      client.db,
      oldMessage.guild.id
    );

    if (!isEventEnabled(config, 'message.edit')) return;

    let logChannel = null;

    // 🔥 CATEGORY
    if (config.logs?.categories?.message) {
      logChannel =
        oldMessage.guild.channels.cache.get(config.logs.categories.message)
        || await oldMessage.guild.channels
          .fetch(config.logs.categories.message)
          .catch(() => null);
    }

    // 🔥 FALLBACK
    if (!logChannel && config.logs?.channel) {
      logChannel =
        oldMessage.guild.channels.cache.get(config.logs.channel)
        || await oldMessage.guild.channels
          .fetch(config.logs.channel)
          .catch(() => null);
    }

    if (!logChannel) return;

    // 🔥 CONTENIDO LIMPIO
    const before = oldMessage.content.slice(0, 1000);
    const after = newMessage.content.slice(0, 1000);

    // 🔥 DIFF INTELIGENTE
    let diff;

    if (after.startsWith(before)) {
      const added = after.slice(before.length);
      diff = `\`\`\`diff\n+ ${added}\n\`\`\``;
    } else {
      diff = `\`\`\`diff
- Antes:
${before}

+ Después:
${after}
\`\`\``;
    }

    // 🔗 LINK
    const messageLink = `https://discord.com/channels/${oldMessage.guild.id}/${oldMessage.channel.id}/${oldMessage.id}`;

    const embed = createLogEmbed({
      title: '✏️ Message Edited',
      color: '#ffaa00',
      user: oldMessage.author,
      fields: [
        {
          name: '👤 Usuario',
          value: `${oldMessage.author}\n🆔 \`${oldMessage.author.id}\``,
          inline: true
        },
        {
          name: '💬 Canal',
          value: `<#${oldMessage.channel.id}>\n🆔 \`${oldMessage.channel.id}\``,
          inline: true
        },
        {
          name: '🔗 Ir al mensaje',
          value: `[Ir al mensaje](${messageLink})`,
          inline: false
        },
        {
          name: '📝 Cambios',
          value: diff,
          inline: false
        },
        {
          name: '🆔 Message ID',
          value: `\`${oldMessage.id}\``,
          inline: false
        }
      ],
      footer: `Servidor: ${oldMessage.guild.name}`
    });

    await logChannel.send({ embeds: [embed] });

  }
};