/**
 * /mm Command - DEPRECATED
 * This command has been removed. Use the setup-mm panel instead.
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('mm')
    .setDescription('❌ Este comando foi descontinuado. Use o painel de intermediação.')
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.reply({
      content: '❌ **Comando Descontinuado**\n\n' +
               'O comando `/mm` foi substituído pelo sistema de painel.\n' +
               'Procure por uma mensagem com o button 🤝 **Iniciar Intermediação** em um canal designado.\n\n' +
               'Caso não encontre, peça para um administrador usar `/setup-mm`.',
      ephemeral: true
    });
  }
};