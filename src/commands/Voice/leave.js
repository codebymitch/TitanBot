import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { errorEmbed, successEmbed } from "../../utils/embeds.js";
import { logger } from "../../utils/logger.js";
import { handleInteractionError } from "../../utils/errorHandler.js";
import { InteractionHelper } from "../../utils/interactionHelper.js";
import { getVoiceConnection } from "@discordjs/voice";

export default {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Leave the current voice channel")
    .setDMPermission(false),

  category: "Voice",

  async execute(interaction, config, client) {
    try {
      const deferred = await InteractionHelper.safeDefer(interaction, {
        flags: MessageFlags.Ephemeral,
      });
      if (!deferred) return;

      const connection = getVoiceConnection(interaction.guildId);

      if (!connection) {
        return await InteractionHelper.safeEditReply(interaction, {
          embeds: [
            errorEmbed(
              "Not in Voice Channel",
              "I'm not currently in a voice channel!",
            ),
          ],
        });
      }

      const channelName =
        interaction.guild.members.me.voice.channel?.name || "voice channel";
      connection.destroy();

      logger.info("Bot left voice channel", {
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        guildId: interaction.guildId,
        commandName: "leave",
      });

      await InteractionHelper.safeEditReply(interaction, {
        embeds: [
          successEmbed("Left Voice Channel", `Left **${channelName}**!`),
        ],
      });
    } catch (error) {
      logger.error("Error leaving voice channel", {
        error: error.message,
        stack: error.stack,
        userId: interaction.user.id,
        guildId: interaction.guildId,
        commandName: "leave",
      });
      await handleInteractionError(interaction, error, {
        commandName: "leave",
      });
    }
  },
};
