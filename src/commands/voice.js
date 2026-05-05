import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';

export default {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Comandos de voz')
    
    // 🔊 SUBCOMANDO JOIN CON SELECTOR
    .addSubcommand(sub =>
      sub.setName('join')
        .setDescription('El bot entra a un canal de voz')
        .addChannelOption(option =>
          option.setName('canal')
            .setDescription('Selecciona el canal de voz')
            .addChannelTypes(ChannelType.GuildVoice) // 🔥 SOLO VOICE
            .setRequired(true)
        )
    )

    // 🚪 SUBCOMANDO LEAVE
    .addSubcommand(sub =>
      sub.setName('leave')
        .setDescription('El bot sale del canal de voz')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // 🔊 JOIN
    if (subcommand === 'join') {
      const channel = interaction.options.getChannel('canal');

      if (!channel) {
        return interaction.reply({
          content: '❌ Debes seleccionar un canal de voz.',
          ephemeral: true
        });
      }

      try {
        joinVoiceChannel({
          channelId: channel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        return interaction.reply(`✅ Me uní al canal: ${channel.name}`);
      } catch (error) {
        console.error(error);
        return interaction.reply('❌ Error al conectarme.');
      }
    }

    // 🚪 LEAVE
    if (subcommand === 'leave') {
      const connection = getVoiceConnection(interaction.guild.id);

      if (!connection) {
        return interaction.reply({
          content: '❌ No estoy en un canal de voz.',
          ephemeral: true
        });
      }

      connection.destroy();

      return interaction.reply('👋 Me salí del canal.');
    }
  }
};