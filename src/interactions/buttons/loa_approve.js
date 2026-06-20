// src/interactions/buttons/loa_approve.js
// Handles LOA approve and deny buttons

import { EmbedBuilder } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { getFromDb, setInDb } from '../../utils/database.js';

const LOA_ROLE_ID = '1513775663834992730';

async function execute(interaction, client) {
  try {
    const parts = interaction.customId.split('_');
    const action = parts[1]; // 'approve' or 'deny'
    const loaId = parts[2];
    const userId = parts[3];

    if (!interaction.member.permissions.has(0x10000000n)) { // ManageRoles
      return interaction.reply({ content: '❌ You need Manage Roles permission to approve/deny LOAs.', ephemeral: true });
    }

    const loa = await getFromDb(`loa_active_${interaction.guild.id}_${userId}`, null);
    if (!loa) {
      return interaction.reply({ content: '❌ This LOA request no longer exists or has already been processed.', ephemeral: true });
    }

    if (loa.status !== 'pending') {
      return interaction.reply({ content: `❌ This LOA has already been **${loa.status}**.`, ephemeral: true });
    }

    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = EmbedBuilder.from(originalEmbed);

    const member = await interaction.guild.members.fetch(userId).catch(() => null);

    if (action === 'approve') {
      // Update status
      loa.status = 'approved';
      loa.approvedBy = interaction.user.id;
      loa.approvedAt = new Date().toISOString();
      await setInDb(`loa_active_${interaction.guild.id}_${userId}`, loa);

      // Give LOA role
      if (member) {
        await member.roles.add(LOA_ROLE_ID).catch(() => {});
      }

      // Update embed status field
      const fields = updatedEmbed.data.fields || [];
      const statusField = fields.find(f => f.name === 'Status');
      if (statusField) statusField.value = '🟢 **Approved**';

      updatedEmbed.setColor(0x2ECC71);
      updatedEmbed.addFields({
        name: 'Approved By',
        value: `<@${interaction.user.id}> • <t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      });

      // Disable buttons
      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

      // Notify user via DM
      if (member) {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2ECC71)
              .setTitle('✅ LOA Approved')
              .setDescription(`Your LOA request (\`${loaId}\`) in **${interaction.guild.name}** has been **approved**!\n\nEnjoy your time off. When you return, use \`/loa return\` to mark yourself back.`)
              .addFields(
                { name: 'Start Date', value: loa.startDate, inline: true },
                { name: 'Return Date', value: loa.endDate, inline: true },
              )
              .setTimestamp(),
          ],
        }).catch(() => {});
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ECC71)
            .setDescription(`✅ Approved LOA \`${loaId}\` for <@${userId}>. They have been given the LOA role.`)
        ],
        ephemeral: true,
      });

    } else if (action === 'deny') {
      // Update status
      loa.status = 'denied';
      loa.deniedBy = interaction.user.id;
      loa.deniedAt = new Date().toISOString();
      await setInDb(`loa_active_${interaction.guild.id}_${userId}`, null);
      await setInDb(`loa_denied_${interaction.guild.id}_${userId}_${loaId}`, loa);

      // Update embed
      const fields = updatedEmbed.data.fields || [];
      const statusField = fields.find(f => f.name === 'Status');
      if (statusField) statusField.value = '🔴 **Denied**';

      updatedEmbed.setColor(0xE74C3C);
      updatedEmbed.addFields({
        name: 'Denied By',
        value: `<@${interaction.user.id}> • <t:${Math.floor(Date.now() / 1000)}:F>`,
        inline: false,
      });

      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

      // Notify user via DM
      if (member) {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xE74C3C)
              .setTitle('❌ LOA Denied')
              .setDescription(`Your LOA request (\`${loaId}\`) in **${interaction.guild.name}** has been **denied**.\n\nIf you have questions, please contact staff.`)
              .setTimestamp(),
          ],
        }).catch(() => {});
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xE74C3C)
            .setDescription(`❌ Denied LOA \`${loaId}\` for <@${userId}>.`)
        ],
        ephemeral: true,
      });
    }

  } catch (error) {
    logger.error('Error handling LOA button:', error);
    await interaction.reply({ content: 'An error occurred while processing this LOA.', ephemeral: true }).catch(() => {});
  }
}

export default [
  { name: 'loa_approve', execute },
  { name: 'loa_deny', execute },
];
