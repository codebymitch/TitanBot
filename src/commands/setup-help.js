/**
 * /setup-help Command
 * 
 * Creates a permanent, fixed message in the current channel with a professional
 * support interface and a button to open a support ticket.
 * Restricted to Administrators only.
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import versionConfig from '../config/version.js';

// Custom ID for the setup message button
export const HELP_SETUP_BUTTON_ID = 'help_create_ticket';

/**
 * Create the setup message embed with modern customized design
 */
function createSetupEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2) // Discord blurple color
    .setTitle('🛠️ Atendimento e Suporte')
    .setThumbnail('https://images-ext-1.discordapp.net/external/8h1dXavug_ACztUMxYRo-aZMCdIL6o1GkUcN-S9ybWA/https/media.tenor.com/IpTNBgceTUAAAAPo/howl.mp4')
    .setDescription(
      'Clique no botão abaixo para abrir um ticket privado e falar diretamente com a nossa equipe.'
    )
    .addFields(
      {
        name: '💡 COMO FUNCIONA?',
        value: '1. Clique no botão "Criar Ticket"\n' +
               '2. Um canal privado será criado para você\n' +
               '3. Descreva seu problema ou dúvida\n' +
               '4. Nossa equipe irá atendê-lo o mais breve possível\n\n',
        inline: false
      },
      {
        name: '📋 REGRAS IMPORTANTES',
        value: '🚫 Não faça spam de tickets\n' +
               '📝 Descreva seu problema de forma clara\n' +
               '⏳ Aguarde pacientemente o atendimento\n' +
               '🔒 Seu ticket será privado e seguro\n\n',
        inline: false
      },
      {
        name: '⏱️ TEMPO DE RESPOSTA',
        value: 'Geralmente respondemos em até **24 horas**.\n' +
               'Para urgências, mencione @Suporte no ticket.\n\n',
        inline: false
      }
    )
    .setFooter({ text: versionConfig.getFooter() })
    .setTimestamp();
}

/**
 * Create the "Create Ticket" button
 */
function createTicketButton() {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(HELP_SETUP_BUTTON_ID)
        .setLabel('📩 Criar Ticket')
        .setStyle(ButtonStyle.Primary)
    );
}

export default {
  data: new SlashCommandBuilder()
    .setName('setup-help')
    .setDescription('🛠️ Configurar painel de suporte neste canal (Apenas Administradores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  /**
   * Execute the /setup-help command
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
        components: [createTicketButton()]
      });

      await interaction.editReply({
        content: '✅ Painel de suporte criado com sucesso neste canal!'
      });

    } catch (error) {
      console.error('Error in setup-help command:', error);
      
      const errorMessage = {
        content: '❌ Erro ao criar painel de suporte.',
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