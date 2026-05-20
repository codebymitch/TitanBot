/**
 * /fecharticket Command
 * 
 * Allows the assigned middleman to close a ticket manually at any time.
 * This command can only be used in MM ticket channels by the responsible middleman.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { parseTopicData, serializeTopicData, isUserStaff } from '../handlers/mmHumanoHandler.js';
import mmConfig from '../config/mmConfig.js';

function parseAmountToNumber(amountDisplay) {
  if (!amountDisplay) return 0;
  let numericStr = String(amountDisplay).replace(/[^0-9,\.]/g, '').trim();
  if (numericStr.includes(',') && !numericStr.includes('.')) numericStr = numericStr.replace(',', '.');
  const v = parseFloat(numericStr);
  return isNaN(v) ? 0 : v;
}

function formatCurrency(value) {
  return 'R$ ' + value.toFixed(2).replace('.', ',');
}

function calculateMMFeeValue(amountDisplay) {
  const amount = parseAmountToNumber(amountDisplay);
  if (amount <= 2.5) return 0.5;
  if (amount > 2.5 && amount <= 100) return 1.0;
  if (amount > 100 && amount <= 200) return 2.0;
  if (amount > 200 && amount <= 400) return 3.5;
  if (amount > 400 && amount <= 600) return 5.0;
  if (amount > 600 && amount <= 700) return 7.0;
  return parseFloat((amount * 0.012).toFixed(2));
}

function calculateMMFee(amountDisplay) {
  const fee = calculateMMFeeValue(amountDisplay);
  return formatCurrency(fee);
}

/**
 * Create the ticket table embed
 */
function createTicketTableEmbed(data) {
  const { buyerDisplay, sellerDisplay, method, amountDisplay, statusDisplay, middlemanDisplay, mmFeeDisplay } = data;
  const feeDisplay = mmFeeDisplay || calculateMMFee(amountDisplay);
  const feeValue = mmFeeDisplay ? parseAmountToNumber(mmFeeDisplay) : calculateMMFeeValue(amountDisplay);
  const amountValue = parseAmountToNumber(amountDisplay);
  const totalDisplay = formatCurrency(amountValue + feeValue);

  let table = '```';
  table += '┌──────────────────────────────────────────┐\n';
  table += '│        DADOS DA INTERMEDIAÇÃO            │\n';
  table += '├──────────────────────────────────────────┤\n';
  table += '│ 💵 Método: ' + method.padEnd(29) + '│\n';
  table += '│ 💰 Valor:  ' + amountDisplay.padEnd(29) + '│\n';
  table += '│ 📊 Taxa MM:' + feeDisplay.padEnd(27) + '│\n';
  table += '│ 👤 Comprador: ' + buyerDisplay.padEnd(24) + '│\n';
  table += '│ 🎒 Vendedor:  ' + sellerDisplay.padEnd(24) + '│\n';
  table += '├──────────────────────────────────────────┤\n';
  table += '│ Status: ' + statusDisplay.padEnd(30) + '│\n';
  if (middlemanDisplay) {
    table += '│ 🛡️ Middleman: ' + middlemanDisplay.padEnd(25) + '│\n';
  } else {
    table += '│ 🛡️ Middleman: ' + 'Aguardando suporte'.padEnd(22) + '│\n';
  }
  table += '└──────────────────────────────────────────┘\n';
  table += '```';
  table += '```';

  const statusColor = data.statusColor || 0x27AE60;

  const embed = new EmbedBuilder()
    .setColor(statusColor)
    .setTitle('🛡️ Intermediação Ativa')
    .setDescription(table)
    .addFields({ name: '💳 Valor Total', value: `**${totalDisplay}**`, inline: false })
    .setFooter({ text: 'ID: ' + Date.now().toString(36).toUpperCase() })
    .setTimestamp();

  return embed;
}

export default {
  data: new SlashCommandBuilder()
    .setName('fecharticket')
    .setDescription('🔒 Fechar ticket de intermediação (Apenas MM responsável)')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .setDMPermission(false),

  /**
   * Execute the /fecharticket command
   */
  async execute(interaction) {
    try {
      // Defer the reply immediately to prevent timeout
      await interaction.deferReply({ ephemeral: true });

      // Check if this is a MM ticket channel
      const channel = interaction.channel;
      const topic = channel.topic || '';
      const data = parseTopicData(topic);

      if (!data) {
        return interaction.editReply({
          content: '❌ Este comando só pode ser usado em canais de intermediação.',
          ephemeral: true
        });
      }

      // Check if user is staff (FAST CHECK)
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!member) {
        return interaction.editReply({
          content: '❌ Erro ao verificar permissões.',
          ephemeral: true
        });
      }

      const isStaff = await isUserStaff(member, interaction.guild);
      if (!isStaff) {
        return interaction.editReply({
          content: '❌ Apenas membros da equipe com o cargo "Suporte" podem usar este comando.',
          ephemeral: true
        });
      }

      // Check if user is the assigned middleman
      if (data.mmId !== interaction.user.id) {
        return interaction.editReply({
          content: '❌ Apenas o MM responsável pode fechar este ticket.',
          ephemeral: true
        });
      }

      // Update status to COMPLETED
      data.status = 'COMPLETED';
      await channel.setTopic(serializeTopicData(data));

      // Fetch usernames for display (parallel for speed)
      const [buyerMember, sellerMember] = await Promise.all([
        interaction.guild.members.fetch(data.buyerId).catch(() => null),
        interaction.guild.members.fetch(data.sellerId).catch(() => null)
      ]);

      const buyerName = buyerMember?.user.username || 'Unknown';
      const sellerName = sellerMember?.user.username || 'Unknown';

      // Update the embed
      const tableData = {
        buyerDisplay: buyerName,
        sellerDisplay: sellerName,
        method: data.method,
        amountDisplay: data.amount || 'N/A',
        statusDisplay: mmConfig.statusLabels.COMPLETED,
        middlemanDisplay: interaction.user.username,
        statusColor: mmConfig.statusColors.COMPLETED
      };

      const messages = await channel.messages.fetch({ limit: 10 });
      const tableMessage = messages.find(m => m.embeds.length > 0 && m.embeds[0].title === '🛡️ Intermediação Ativa');

      if (tableMessage) {
        await tableMessage.edit({
          embeds: [createTicketTableEmbed(tableData)],
          components: [] // Remove all buttons
        });
      }

      // Send final message with countdown
      const countdownMsg = await channel.send({
        content: '🔒 **Intermediação Concluída**\n' +
                 'Fechada por comando de: ' + interaction.user.toString() + '\n\n' +
                 '⚠️ Este canal será deletado em **5 segundos**...'
      });

      // Countdown
      for (let i = 4; i >= 1; i--) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          await countdownMsg.edit({
            content: '🔒 **Intermediação Concluída**\n' +
                     'Fechada por comando de: ' + interaction.user.toString() + '\n\n' +
                     '⚠️ Este canal será deletado em **' + i + ' segundos**...'
          });
        } catch { /* ignore */ }
      }

      await interaction.editReply({
        content: '✅ Intermediação concluída com sucesso!'
      });

      // Delete channel after closing countdown and remove category if empty
      try {
        const parent = channel.parent;
        const parentChildCount = parent ? parent.children.cache.size : 0;
        if (channel.deletable) await channel.delete();
        if (parent && parentChildCount <= 1 && parent.deletable) {
          await parent.delete('Fechando categoria criada para a intermediação');
        }
      } catch (err) {
        console.warn('Failed to delete channel/category after fecharticket', err && err.message ? err.message : err);
      }

    } catch (error) {
      console.error('Error in fecharticket command:', error);
      
      const errorMessage = {
        content: '❌ Erro ao fechar ticket de intermediação.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
};
