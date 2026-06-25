import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError, TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const SAVED_ROLES_KEY = (guildId, userId) => `saved_roles_${guildId}_${userId}`;

export default {
  data: new SlashCommandBuilder()
    .setName('restore')
    .setDescription('Restore a member\'s saved roles after a punishment')
    .addUserOption(opt =>
      opt.setName('member')
        .setDescription('The member to restore roles for')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  category: 'moderation',

  async execute(interaction, config, client) {
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const user = interaction.options.getUser('member');
      const member = interaction.options.getMember('member');

      if (!member) {
        throw new TitanBotError('Member not found', ErrorTypes.USER_INPUT, 'That member is not in this server.', { subtype: 'not_found' });
      }

      // Get saved roles from database
      const saved = await getFromDb(SAVED_ROLES_KEY(interaction.guild.id, user.id), null);

      if (!saved || !saved.roles || saved.roles.length === 0) {
        throw new TitanBotError('No saved roles', ErrorTypes.USER_INPUT, `No saved roles found for <@${user.id}>. They may not have been punished with role removal.`, { subtype: 'no_saved_roles' });
      }

      // Filter out roles that no longer exist
      const restoredRoles = [];
      const missingRoles = [];

      for (const roleId of saved.roles) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role) {
          restoredRoles.push(roleId);
        } else {
          missingRoles.push(roleId);
        }
      }

      // Add roles back
      if (restoredRoles.length > 0) {
        await member.roles.add(restoredRoles).catch(err => {
          throw new TitanBotError('Role restore failed', ErrorTypes.UNKNOWN, `Failed to restore roles: ${err.message}`, { subtype: 'restore_failed' });
        });
      }

      // Clear saved roles from database
      await setInDb(SAVED_ROLES_KEY(interaction.guild.id, user.id), null);

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Roles Restored')
        .setDescription(`Successfully restored **${restoredRoles.length}** role(s) for <@${user.id}>.`)
        .addFields(
          {
            name: 'Restored Roles',
            value: restoredRoles.map(id => `<@&${id}>`).join(', ') || 'None',
            inline: false,
          },
        )
        .setTimestamp();

      if (missingRoles.length > 0) {
        embed.addFields({
          name: '⚠️ Missing Roles',
          value: `${missingRoles.length} role(s) no longer exist and could not be restored.`,
          inline: false,
        });
      }

      embed.addFields({
        name: 'Restored by',
        value: `<@${interaction.user.id}>`,
        inline: false,
      });

      await InteractionHelper.universalReply(interaction, { embeds: [embed] });

      // Also notify in channel
      await interaction.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ECC71)
            .setDescription(`✅ <@${user.id}>'s roles have been restored by <@${interaction.user.id}>.`),
        ],
      }).catch(() => {});

      logger.info('Roles restored', {
        userId: interaction.user.id,
        targetId: user.id,
        guildId: interaction.guild.id,
        restoredCount: restoredRoles.length,
      });

    } catch (error) {
      logger.error('Restore command error:', error);
      await handleInteractionError(interaction, error, { subtype: 'restore_failed' });
    }
  },
};
