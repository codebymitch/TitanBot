const Discord = require("discord.js");

module.exports = (client, player, track) => {
  player.destroy();

  const channel = client.channels.cache.get(player.textId);
  client.errNormal(
    {
      error: "Queue is empty, Leaving voice channel",
    },
    channel,
  );
};
