require('dotenv').config();
const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, ButtonStyle } = require('discord.js');
const ytSearch = require('yt-search');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Search and play a song or playlist.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('search')
        .setDescription('Search for and play a song.')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('The song to search for')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('playlist')
        .setDescription('Play a playlist from YouTube.')
        .addStringOption(option =>
          option.setName('url')
            .setDescription('The URL of the YouTube playlist')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('spotify')
        .setDescription('Play a song or playlist from Spotify.')
        .addStringOption(option =>
          option.setName('url')
            .setDescription('The URL of the Spotify track or playlist')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const query = interaction.options.getString('query') || interaction.options.getString('url');
    const channel = interaction.member.voice.channel;

    if (!channel) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#FFFF00').setDescription('🚫 You need to be in a voice channel to play music.')],
        ephemeral: true,
      });
    }

    try {
      await interaction.deferReply();

      if (subcommand === 'playlist') {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF00FF')
              .setDescription('Playlist Not supported in Free Tier Bot.')
          ],
        });
      }  else if (subcommand === 'search') {
        const searchResult = await ytSearch(query);

        if (!searchResult || !searchResult.videos.length) {
          return interaction.followUp({
            embeds: [new EmbedBuilder().setColor('#FFFF00').setDescription('🚫 No songs found for your query.')],
          });
        }

        const videos = searchResult.videos.slice(0, 5);

        const embed = new EmbedBuilder()
          .setTitle('Search Results')
          .setDescription('Select a song to play:')
          .setColor('#ff0000');
        
        videos.forEach((video, index) => {
          embed.addFields({
            name: `${index + 1}. ${video.title}`,
            value: `Duration: ${video.timestamp} | ${video.author.name}`,
            inline: false,
          });
        });
        
        const row1 = new ActionRowBuilder();
        
        videos.forEach((video, index) => {
          row1.addComponents(
            new ButtonBuilder()
              .setCustomId(`play_${index}`)
              .setLabel(`${index + 1}`)
              .setStyle(ButtonStyle.Primary)
          );
        });
        
        const sentMessage = await interaction.followUp({ embeds: [embed], components: [row1] });
        
        const filter = i => i.customId.startsWith('play_') && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

        collector.on('collect', async i => {
          try {

            const disabledRow = new ActionRowBuilder().addComponents(
              row1.components.map(button => 
                ButtonBuilder.from(button).setDisabled(true)
              )
            );
            
            
            await i.update({ components: [disabledRow] });
            
            const [action, index] = i.customId.split('_');
            const selectedVideo = videos[parseInt(index)];

            if (selectedVideo) {
    
              const queueMessage = await interaction.followUp({
                embeds: [
                  new EmbedBuilder()
                    .setColor('#FF00FF')
                    .setDescription(`🎶 Queuing: **${selectedVideo.title}**...`),
                ],
              });
              
              try {
                await interaction.client.playerManager.distube.play(channel, selectedVideo.url, {
                  member: interaction.member,
                  textChannel: interaction.channel,
                  timeout: 60000, 
                });
              } catch (playError) {
                if (playError.errorCode === 'VOICE_CONNECT_FAILED') {
               
                  console.log('Voice connect failed, attempting to rejoin...');
                  await new Promise(resolve => setTimeout(resolve, 2000)); 
                  await interaction.client.playerManager.distube.voices.join(channel);
                  await new Promise(resolve => setTimeout(resolve, 2000)); 
                  await interaction.client.playerManager.distube.play(channel, selectedVideo.url, {
                    member: interaction.member,
                    textChannel: interaction.channel,
                    timeout: 60000,
                  });
                } else {
                  throw playError; 
                }
              }
              
            
              await queueMessage.edit({
                embeds: [
                  new EmbedBuilder()
                    .setColor('#00FF00')
                    .setDescription(`✅ Successfully queued: **${selectedVideo.title}**`),
                ],
              });
            } else {
              await interaction.followUp({
                embeds: [new EmbedBuilder().setColor('#FFFF00').setDescription('🚫 The selected song could not be found.')],
              });
            }
          } catch (error) {
            console.error('Play Error:', error);
            await interaction.followUp({
              embeds: [new EmbedBuilder().setColor('#FFFF00').setDescription('🚫 An error occurred while trying to play the song.')],
            });
          }

          collector.stop();
        });

        collector.on('end', async collected => {
          if (!collected.size) {
           
            const timeoutRow = new ActionRowBuilder().addComponents(
              row1.components.map(button => 
                ButtonBuilder.from(button).setDisabled(true)
              )
            );
            
            await sentMessage.edit({
              embeds: [embed],
              components: [timeoutRow]
            });
            
            await interaction.followUp({
              embeds: [new EmbedBuilder().setColor('#FFFFFF').setDescription('⚠️ You didn\'t select any song in time.')],
            });
          }
        });

      } else if (subcommand === 'spotify') {

        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF00FF')
              .setDescription('Playlist Not supported in Free Tier Bot.')
          ],
        });
      }
    
    } catch (error) {
      console.error('Error:', error);
      await interaction.followUp({
        embeds: [new EmbedBuilder().setColor('#FFFF00').setDescription('🚫 An error occurred while processing your request.')],
      });
    }
  },
};