/**
 * /setup-mm Command
 * 
 * Creates a permanent, fixed message in the current channel with a professional
 * welcome interface and a button to start the middleman process.
 * Restricted to Administrators only.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import versionConfig from '../config/version.js';

// Custom IDs for the setup message button
export const MM_SETUP_BUTTON_ID = 'mm_start_intermediacao';

/**
 * Create the setup message embed with modern customized design
 */
function createSetupEmbed() {
  return new EmbedBuilder()
    .setColor(0xE8511A) // Custom orange color
    .setTitle('🛡️ INTERMEDIAÇÃO DE TRADES')
    .setThumbnail('https://images-ext-1.discordapp.net/external/8h1dXavug_ACztUMxYRo-aZMCdIL6o1GkUcN-S9ybWA/https/media.tenor.com/IpTNBgceTUAAAAPo/howl.mp4')
    .setDescription(
      '> Um middleman (intermediário) irá garantir que tanto o comprador quanto o vendedor cumpram com seus compromissos de forma segura e transparente.'
    )
    .addFields(
      {
        name: '💡 COMO FUNCIONA?',
        value: '1. Clique no botão abaixo para iniciar\n' +
               '2. Preencha as informações da trade\n' +
               '3. Um canal privado será criado\n' +
               '4. Um middleman assumirá a intermediação\n\n',
        inline: false
      },
      {
        name: '⚠️ REGRAS IMPORTANTES',
        value: '🚫 Nunca compartilhe informações pessoais\n' +
               '📋 Siga as instruções no canal privado\n' +
               '🔒 O middleman é o único autorizado a fechar a trade\n\n',
        inline: false
      },
      {
        name: '💰 TAXAS',
        value: '**Taxas Normais:**\n' +
               'R$0,50 - Abaixo de R$2,50\n' +
               'R$1,00 - Acima de R$2,50\n' +
               'R$2,00 - Acima de R$100\n' +
               'R$3,50 - Acima de R$200\n' +
               'R$5,00 - Acima de R$400\n' +
               'R$7,00 - Acima de R$600\n' +
               '1,2% - Acima de R$700\n\n',
        inline: false
      }
    )
    .setFooter({ text: versionConfig.getFooter() })
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
      await interaction.deferReply({ ephemeral: true });

      // Only administrators can use this command
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({
          content: '❌ Apenas administradores podem usar este comando.',
          ephemeral: true
        });
      }

      // Send the setup message
      await interaction.channel.send({
        embeds: [createSetupEmbed()],
        components: [createStartButton()]
      });

      await interaction.editReply({
        content: '✅ Painel de intermediação criado com sucesso neste canal!'
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