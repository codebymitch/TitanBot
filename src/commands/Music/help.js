const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Shows all available commands'),
  
  async execute(interaction) {
    // Path to the folder containing your command files
    const commandsFolder = path.join(__dirname);
    const commandFiles = fs.readdirSync(commandsFolder).filter(file => file.endsWith('.js'));

    const helpEmbed = new EmbedBuilder()
      .setTitle('Help - Available Commands')
      .setDescription('- By : GlaceYT')
      .setColor('#0099ff');

    commandFiles.forEach(file => {
      const command = require(path.join(commandsFolder, file));
      if (command.data && command.data.name && command.data.description) {
        helpEmbed.addFields({
          name: `/${command.data.name}`,
          value: command.data.description,
        });
      }
    });

    await interaction.reply({ embeds: [helpEmbed] });
  },
};
