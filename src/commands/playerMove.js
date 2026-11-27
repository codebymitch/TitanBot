const Discord = require("discord.js");

module.exports = (client, player, currentChannel, newChannel) => {
  if (!newChannel) {
    player.destroy();

    const channel = client.channels.cache.get(player.textId);
    client.errNormal(
      {
        error: "Music has stopped. I'm disconnected from the channel",
      },
      channel,
    );
  } else {
    player.setVoiceChannel(newChannel.newChannelId || newChannel);
    if (player.paused) return;
    setTimeout(() => {
      player.pause(true);
      setTimeout(() => player.pause(false), client.ws.ping * 2);
    }, client.ws.ping * 2);
  }
};
