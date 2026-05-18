/**
 * /setup-mm Command
 * 
 * Comando para administradores configurarem o sistema de Middleman.
 * Envia uma mensagem fixa com o botão "Iniciar Intermediação".
 */

import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup-mm')
    .setDescription('🛡️ Configurar painel de intermediação (Apenas Administradores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  /**
   * Execute the /setup-mm command
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {import('discord.js').Client} client
   */
  async execute(interaction, client) {
    try {
      // Check if user is in a guild
      if (!interaction.guild) {
        return interaction.reply({
          content: '❌ Este comando só pode ser usado em um servidor.',
          ephemeral: true
        });
      }

      // Check if user has administrator permission
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: '❌ Apenas administradores podem usar este comando.',
          ephemeral: true
        });
      }

      // Create the embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🛡️ Sistema de Intermediação')
        .setDescription(
          'Bem-vindo ao sistema de intermediação seguro!\n\n' +
          'Clique no botão abaixo para iniciar uma troca intermediada.\n' +
          'Um membro da equipe irá acompanhar toda a negociação.\n\n' +
          '**Como funciona:**\n' +
          '• Você será questionado sobre sua função na troca\n' +
          '• Um canal privado será criado para a negociação\n' +
          '• Um staff assumirá a intermediação\n' +
          '• A troca só será finalizada com segurança para ambos'
        )
        .addFields(
          {
            name: '💎 Vantagens',
            value: '• Segurança garantida\n• Staff especializado\n• Canal privado\n• Suporte completo'
          }
        )
        .setFooter({ text: 'Sistema de Intermediação • Cbloxbot' })
        .setTimestamp();

      // Create the button
      const button = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('mm_iniciar_intermediacao')
            .setLabel('Iniciar Intermediação')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🛡️')
        );

      // Send the message
      await interaction.channel.send({
        content: '**🛡️ Painel de Intermediação**\nClique no botão abaixo para começar uma troca segura.',
        embeds: [embed],
        components: [button]
      });

      await interaction.reply({
        content: '✅ Painel de intermediação criado com sucesso!',
        ephemeral: true
      });

    } catch (error) {
      console.error('Error executing /setup-mm command:', error);
      
      const errorMessage = {
        content: '❌ Ocorreu um erro ao processar sua solicitação.',
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