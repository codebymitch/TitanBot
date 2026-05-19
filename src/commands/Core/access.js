import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import {
  isOwner,
  grantAccess,
  revokeAccess,
  listAccess,
  isGuildApproved,
} from '../../services/accessService.js';
import { logger } from '../../utils/logger.js';

export default {
  data: new SlashCommandBuilder()
    .setName('access')
    .setDescription('Bot owner: manage which servers can use the bot.')
    .addSubcommand((s) =>
      s
        .setName('grant')
        .setDescription('Approve a server so it can use the bot.')
        .addStringOption((o) =>
          o.setName('guild_id').setDescription('Server (guild) ID to approve.').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('revoke')
        .setDescription('Remove a server\'s access.')
        .addStringOption((o) =>
          o.setName('guild_id').setDescription('Server (guild) ID to revoke.').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Check whether a server is approved.')
        .addStringOption((o) =>
          o.setName('guild_id').setDescription('Server (guild) ID to check.').setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName('list').setDescription('List all approved servers.'),
    ),

  async execute(interaction, config, client) {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        embeds: [{ color: 0xef4444, title: '⛔ Solo el dueño del bot', description: 'Este comando es exclusivo del dueño del bot.' }],
        flags: MessageFlags.Ephemeral,
      });
    }

    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'list') {
        const entries = await listAccess(client.db);
        if (entries.length === 0) {
          return interaction.reply({
            embeds: [{ color: 0xf5b942, title: '📭 Sin servidores aprobados', description: 'Aún no has aprobado ningún servidor.' }],
            flags: MessageFlags.Ephemeral,
          });
        }
        const lines = entries.map((e) => {
          const g = client.guilds.cache.get(e.guildId);
          const name = g ? g.name : 'desconocido / bot no está';
          return `• **${name}** — \`${e.guildId}\``;
        });
        return interaction.reply({
          embeds: [{
            color: 0x22c55e,
            title: `✅ Servidores aprobados (${entries.length})`,
            description: lines.join('\n').slice(0, 4000),
          }],
          flags: MessageFlags.Ephemeral,
        });
      }

      const guildId = interaction.options.getString('guild_id').trim();
      if (!/^\d{15,25}$/.test(guildId)) {
        return interaction.reply({
          embeds: [{ color: 0xef4444, title: '❌ ID inválido', description: 'El ID del servidor debe ser numérico.' }],
          flags: MessageFlags.Ephemeral,
        });
      }
      const g = client.guilds.cache.get(guildId);
      const label = g ? `**${g.name}** (\`${guildId}\`)` : `\`${guildId}\``;

      if (sub === 'grant') {
        await grantAccess(client.db, guildId, interaction.user.id);
        logger.info(`Access granted to guild ${guildId} by ${interaction.user.tag}`);
        return interaction.reply({
          embeds: [{ color: 0x22c55e, title: '✅ Acceso concedido', description: `${label} ya puede usar el bot.` }],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (sub === 'revoke') {
        const removed = await revokeAccess(client.db, guildId);
        return interaction.reply({
          embeds: [{
            color: removed ? 0xef4444 : 0xf5b942,
            title: removed ? '🚫 Acceso retirado' : 'ℹ️ Sin cambios',
            description: removed ? `${label} ya no puede usar el bot.` : `${label} no estaba aprobado.`,
          }],
          flags: MessageFlags.Ephemeral,
        });
      }

      // status
      const approved = await isGuildApproved(client.db, guildId);
      return interaction.reply({
        embeds: [{
          color: approved ? 0x22c55e : 0xef4444,
          title: approved ? '✅ Aprobado' : '🔒 No aprobado',
          description: `${label} ${approved ? 'tiene' : 'no tiene'} acceso al bot.`,
        }],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('access command error:', error);
      return interaction.reply({
        embeds: [{ color: 0xef4444, title: 'Error', description: 'No se pudo completar la operación.' }],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};
