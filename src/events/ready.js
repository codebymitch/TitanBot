import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import {
  reconcileTicketPanels,
  reconcileVerificationPanels,
  reconcileReactionRolePanelHealth,
} from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initializeMusic } from "../services/music/music.js";

async function runSafeReconciliation(label, fn, formatSummary) {
  try {
    const summary = await fn();
    if (summary && typeof formatSummary === "function") {
      startupLog(formatSummary(summary));
    }
  } catch (error) {
    logger.error(`Error during ${label}:`, error);
  }
}

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      if (client.user && config?.bot?.presence) {
        client.user.setPresence(config.bot.presence);
      }

      startupLog(`Ready! Logged in as ${client.user?.tag || "Bot"}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands?.size ?? 0} commands`);

      const musicEnabled = client.config?.features?.music ?? true;
      if (musicEnabled) {
        await initializeMusic();
      }

      await runSafeReconciliation(
        "reaction role reconciliation",
        () => reconcileReactionRoleMessages(client),
        (s) =>
          `Reaction role reconciliation: scanned ${s.scannedMessages}, removed ${s.removedMessages}, errors ${s.errors}`
      );

      await runSafeReconciliation(
        "ticket panel health",
        () => reconcileTicketPanels(client),
        (s) =>
          `Ticket panel health: scanned ${s.scannedGuilds} guilds, healthy ${s.healthyPanels}, deleted ${s.deletedPanels}, missing channel ${s.missingChannels}, recovered ${s.recoveredIds}, errors ${s.errors}`
      );

      await runSafeReconciliation(
        "verification panel health",
        () => reconcileVerificationPanels(client),
        (s) =>
          `Verification panel health: scanned ${s.scannedGuilds} guilds, healthy ${s.healthyPanels}, deleted ${s.deletedPanels}, missing channel ${s.missingChannels}, recovered ${s.recoveredIds}, errors ${s.errors}`
      );

      await runSafeReconciliation(
        "reaction role panel health",
        () => reconcileReactionRolePanelHealth(client),
        (s) =>
          `Reaction role panel health: scanned ${s.scannedPanels} panels, healthy ${s.healthyPanels}, deleted ${s.deletedPanels}, missing channel ${s.missingChannels}, recovered ${s.recoveredIds}, errors ${s.errors}`
      );

      await runSafeReconciliation(
        "level role sync",
        () => reconcileLevelRoles(client),
        (s) =>
          `Level role sync: scanned ${s.scannedGuilds} guilds, pruned ${s.prunedRewardEntries} stale rewards, re-awarded ${s.rolesReAwarded} roles, errors ${s.errors}`
      );
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
