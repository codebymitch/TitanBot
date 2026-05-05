import { Events, ChannelType } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { setLogChannel } from "../utils/discordLogger.js"; // 🔥 NUEVO

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      // 🔥 =========================
      // 📊 CONFIGURAR CANAL DE LOGS
      // 🔥 =========================
      const guild = client.guilds.cache.first();
      if (guild) {
        let logChannel = guild.channels.cache.find(c => c.name === "logs");

        if (!logChannel) {
          logChannel = await guild.channels.create({
            name: "logs",
            type: ChannelType.GuildText,
          });

          startupLog("📊 Canal de logs creado automáticamente");
        }

        setLogChannel(logChannel);
      }

      // 🔁 Tu sistema existente (NO TOCADO)
      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};

