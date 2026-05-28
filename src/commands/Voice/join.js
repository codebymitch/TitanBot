import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { errorEmbed, successEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";
import { handleInteractionError } from "../../utils/errorHandler.js";
import { InteractionHelper } from "../../utils/interactionHelper.js";
import { joinVoiceChannel } from "@discordjs/voice";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your current voice channel")
    .setDMPermission(false),

  category: "Voice",

  async execute(interaction, config, client) {
    try {
      const deferred = await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral,
      });
      if (!deferred) return;

      const { member } = interaction;

      if (!member.voice.channel) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            errorEmbed(
              "Not in Voice Channel",
              "You need to be in a voice channel first!",
            ),
          ],
        });
      }

      joinVoiceChannel({
        channelId: member.voice.channel.id,
        guildId: interaction.guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
      });

      logger.info("Bot joined voice channel", {
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        voiceChannelId: member.voice.channel.id,
        voiceChannelName: member.voice.channel.name,
        guildId: interaction.guildId,
        commandName: "join",
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed(
            "Joined Voice Channel",
            `Joined **${member.voice.channel.name}**!`,
          ),
        ],
      });
    } catch (error) {
      logger.error("Error joining voice channel", {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: "join",
      });
      await handleInteractionError(interaction, error, { commandName: "join" });
    }
  },
};
