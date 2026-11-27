const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jump')
    .setDescription('Jump to a specific song in the queue.')
    .addIntegerOption(option =>
      option.setName('position')
        .setDescription('The position of the song in the queue.')
        .setRequired(true)),

  async execute(interaction) {
    const position = interaction.options.getInteger('position');
    const channel = interaction.member.voice.channel;

   
    if (!channel) {
      const noChannelEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ You need to be in a voice channel to jump to a song.')
        .setTimestamp();

      return interaction.reply({ embeds: [noChannelEmbed], ephemeral: true });
    }

    try {
     
      await interaction.client.playerManager.distube.jump(channel, position - 1);

      const successEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Jumped to Song')
        .setDescription(`🔀 Successfully jumped to song **#${position}** in the queue.`)
        .setTimestamp();

      await interaction.reply({ embeds: [successEmbed] });

    } catch (error) {
      console.error('Jump Error:', error);

      const errorEmbed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('Error')
        .setDescription('❌ An error occurred while trying to jump to that song. Please make sure the position is valid and try again.')
        .setTimestamp();

      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  },
};
