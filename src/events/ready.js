import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { loadAndScheduleTempRoles } from "../services/tempRoleService.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      const { status, activities } = config.bot.presence;
      let activityIndex = 0;

      const setActivity = () => {
        client.user.setPresence({
          status,
          activities: [activities[activityIndex]],
        });
        activityIndex = (activityIndex + 1) % activities.length;
      };

      setActivity();
      setInterval(setActivity, 30_000);

      if (client.user.username !== 'itay100k bot') {
        await client.user.setUsername('itay100k bot').catch(err =>
          logger.warn('Could not update bot username (rate limited?):', err.message)
        );
      }

      startupLog(`Ready! Logged in as ${client.user.tag}`);

      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&scope=bot+applications.commands&permissions=8`;
      startupLog(`Invite link: ${inviteUrl}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      await loadAndScheduleTempRoles(client);
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};


