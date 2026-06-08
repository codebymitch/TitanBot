import './src/app.js';
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const { joinVoiceChannel } = require("@discordjs/voice");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const PREFIX = "!";

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !join #voice-channel
  if (command === "join") {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[0]);

    if (!channel) {
      return message.reply("❌ لازم تمنشن روم فويس أو تعطي ID تاعه");
    }

    if (channel.type !== ChannelType.GuildVoice) {
      return message.reply("❌ هذا مو روم فويس");
    }

    try {
      joinVoiceChannel({
        channelId: channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      message.reply(`✅ دخلت للروم: **${channel.name}**`);
    } catch (err) {
      console.error(err);
      message.reply("❌ صار خطأ في الدخول للروم");
    }
  }
});

client.login("MTQ1MDIyODExNjQ1MzU4OTA1NA.G3ZMPY.fHYCVHkMq898zgRXTUQAEiYh1r7eG1rBQfz_j4");
