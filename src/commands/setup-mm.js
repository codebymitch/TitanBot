/**
 * /setup-mm Command
 * 
 * Creates a permanent, fixed message in the current channel with a professional
 * welcome interface and a button to start the middleman process.
 * Restricted to Administrators only.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

// Custom IDs for the setup message button
export const MM_SETUP_BUTTON_ID = 'mm_start_intermediacao';

/**
 * Create the setup message embed
 */
function createSetupEmbed() {
  return new EmbedBuilder()
    .setColor(0x2B2D31) // Dark/neutral color
    .setTitle('🛡️ Serviço de Intermediação')
    .setDescription(
      'Bem-vindo ao nosso sistema de intermediação seguro!\n\n' +
      'Um middleman (intermediário) irá garantir que tanto o **comprador** quanto o **vendedor**\n' +
      'cumpram com seus compromissos de forma segura e transparente.\n\n' +
      '**Como funciona?**\n' +
      '1. Clique no button abaixo para iniciar\n' +
      '2. Preencha as informações da trade\n' +
      '3. Um canal privado será criado\n' +
      '4. Um middleman irá assumir a intermediação'
    )
    .addFields(
      {
        name: '⚠️ Regras Importantes',
        value:
          '• Nunca compartilhe informações pessoais\n' +
          '• Aguarde a confirmação do middleman\n' +
          '• Siga as instruções no canal privado\n' +
          '• Somente middlemen podem fechar a intermediação'
      }
    )
    .setFooter({ text: 'Sistema de Intermediação Seguro' })
    .setTimestamp();
}

/**
 * Create the "Start Intermediation" button
 */
function createStartButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(MM_SETUP_BUTTON_ID)
        .setLabel('🤝 Iniciar Intermediação')
        .setStyle(ButtonStyle.Success)
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('setup-mm')
    .setDescription('🛡️ Configurar painel de intermediação neste canal (Apenas Administradores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  /**
   * Execute the /setup-mm command
   */
  async execute(interaction) {
    try {
      // Only administrators can use this command
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ Apenas administradores podem usar este comando.',
          ephemeral: true
        });
      }

      // Send the setup message
      await interaction.channel.send({
        embeds: [createSetupEmbed()],
        components: [createStartButton()]
      });

      await interaction.reply({
        content: '✅ Painel de intermediação criado com sucesso neste canal!',
        ephemeral: true
      });

    } catch (error) {
      console.error('Error in setup-mm command:', error);
      
      const errorMessage = {
        content: '❌ Erro ao criar painel de intermediação.',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
};