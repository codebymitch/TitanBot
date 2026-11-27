const Discord = require("discord.js");

module.exports = (client, player, track) => {
  let row = new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder()
      .setEmoji(client.emotes.music.previous)
      .setCustomId("Bot-musicprev")
      .setStyle(Discord.ButtonStyle.Secondary),

    new Discord.ButtonBuilder()
      .setEmoji(client.emotes.music.pause)
      .setCustomId("Bot-musicpause")
      .setStyle(Discord.ButtonStyle.Secondary),

    new Discord.ButtonBuilder()
      .setEmoji(client.emotes.music.stop)
      .setCustomId("Bot-musicstop")
      .setStyle(Discord.ButtonStyle.Secondary),

    new Discord.ButtonBuilder()
      .setEmoji(client.emotes.music.next)
      .setCustomId("Bot-musicnext")
      .setStyle(Discord.ButtonStyle.Secondary),
  );

  const channel = client.channels.cache.get(player.textId);

  client.embed(
    {
      title: `${client.emotes.normal.music}・${track.title}`,
      url: track.uri,
      desc: `Music started in <#${player.voiceId}>!`,
      thumbnail: track.thumbnail,
      fields: [
        {
          name: `👤┆Requested By`,
          value: `${track.requester}`,
          inline: true,
        },
        {
          name: `${client.emotes.normal.clock}┆Ends at`,
          value: `<t:${(Date.now() / 1000 + track.length / 1000).toFixed(0)}:f>`,
          inline: true,
        },
        {
          name: `🎬┆Author`,
          value: `${track.author}`,
          inline: true,
        },
      ],
      components: [row],
    },
    channel,
  );
};
