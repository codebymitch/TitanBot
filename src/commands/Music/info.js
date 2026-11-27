const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Provides information about the bot'),
  async execute(interaction) {
    const { client } = interaction;  

   
    const ping = client.ws.ping;  
    const uptime = os.uptime();
    const uptimeFormatted = new Date(uptime * 1000).toISOString().substr(11, 8);

    
    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('Bot Information')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        { name: 'Bot Name', value: client.user.username, inline:false },
        { name: 'Ping', value: `${ping}ms`, inline:false },
        { name: 'Uptime', value: uptimeFormatted, inline:false },
        { name: 'Node.js Version', value: process.version, inline:false },
        { name: 'Platform', value: `${os.platform()} (${os.arch()})`, inline:false }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

  
    await interaction.reply({ embeds: [embed] });
  },
};
