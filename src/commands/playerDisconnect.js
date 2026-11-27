const Discord = require("discord.js");

module.exports = (client, player) => {
  player.destroy();

  const channel = client.channels.cache.get(player.textId);
  client.errNormal(
    {
      error: "Music has stopped. I'm disconnected from the channel",
    },
    channel,
  );
};
