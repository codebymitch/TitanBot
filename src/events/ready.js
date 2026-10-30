import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { findLevelTierRoles } from "../services/leveling/levelTierRoles.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { ensureAuditLogChannels } from "../services/auditLogChannelsService.js";
import { startHomeTickets } from "../services/tickets/homeTickets.js";
import { publishArabicModerationCommands } from "../services/moderationCommandsBoardService.js";
import { publishTrustedBoard } from "../services/trustedBoardService.js";
import { publishSavedIdeasBoard } from "../services/savedIdeasBoardService.js";
import { publishHoneypotNotice } from "../services/security/honeypotNotice.js";
import { publishProofGuide } from "../services/moderation/proofMergeService.js";
import { startCCTopBoard } from "../services/games/ccTopBoard.js";
import { startServersBoard } from "../services/serversBoard.js";
import { startStreak } from "../services/cc/streakService.js";
import { startStoreChannel } from "../services/cc/storeChannel.js";
import { startInviteRewards } from "../services/inviteRewardService.js";
import { ensureTraderRole } from "../services/cc/traderRoleService.js";
import { startCustomRoles } from "../services/cc/customRoleService.js";
import { startVoteKickSweeps } from "../services/voice/voteKickService.js";
import { isHomeGuild } from "../config/homeGuild.js";

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      client.user.setPresence(config.bot.presence);
      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);

      // A failure here must not stop the rest of the startup work.
      try {
        const result = await publishArabicModerationCommands(client);
        startupLog(`Arabic moderation commands: ${result.status} (channel ${result.channelId})`);
      } catch (error) {
        logger.error("Failed to publish Arabic moderation commands:", error);
      }
      try {
        const result = await publishTrustedBoard(client);
        startupLog(`Trusted board: ${result.status} (channel ${result.channelId})`);
      } catch (error) {
        logger.error("Failed to publish trusted board:", error);
      }
      try {
        const result = await publishProofGuide(client);
        startupLog(`Proof guide: ${result.status}`);
      } catch (error) {
        logger.error("Failed to publish the proof guide:", error);
      }
      try {
        // The pinned notice in #dont-type-here (our server only).
        startupLog(`Honeypot notice: ${(await publishHoneypotNotice(client)).status}`);
      } catch (error) {
        logger.error("Failed to post the honeypot notice:", error);
      }
      try {
        const result = await publishSavedIdeasBoard(client);
        startupLog(`Saved ideas board: ${result.status} (channel ${result.channelId})`);
      } catch (error) {
        logger.error("Failed to publish saved ideas board:", error);
      }
      try {
        const ccTopBoard = await startCCTopBoard(client);
        startupLog(`Top CC board: ${ccTopBoard.status} (channel ${ccTopBoard.channelId})`);
      } catch (error) {
        logger.error("Failed to start the Top CC board:", error);
      }
      try {
        const serversBoard = await startServersBoard(client);
        startupLog(`Servers board: ${serversBoard.status} (channel ${serversBoard.channelId})`);
      } catch (error) {
        logger.error("Failed to start the servers board:", error);
      }
      try {
        // The streak room under the games channel and its live board (our server only).
        const streak = await startStreak(client);
        startupLog(`Streak board: ${streak.status}`);
      } catch (error) {
        logger.error("Failed to start the streak board:", error);
      }
      try {
        for (const result of await startStoreChannel(client)) {
          startupLog(`Store room: ${result.status} (channel ${result.channelId})`);
        }
      } catch (error) {
        logger.error("Failed to start the store room:", error);
      }
      try {
        const customRoles = await startCustomRoles(client);
        startupLog(`Custom roles: ${customRoles.status}`);
      } catch (error) {
        logger.error("Failed to start custom roles:", error);
      }
      try {
        // Lifts vote kick blocks when they run out (our server only, the sweep checks).
        startupLog(`Vote kick: ${startVoteKickSweeps(client).status}`);
      } catch (error) {
        logger.error("Failed to start vote kick:", error);
      }
      try {
        const inviteRewards = await startInviteRewards(client);
        startupLog(`Invite rewards: ${inviteRewards.status}`);
      } catch (error) {
        logger.error("Failed to start invite rewards:", error);
      }
      try {
        await ensureAuditLogChannels(client);
      } catch (error) {
        logger.error("Failed to prepare the log rooms:", error);
      }
      try {
        // Our server's tickets: category, panel room, log room and the panel (services/tickets/homeTickets.js).
        const tickets = await startHomeTickets(client);
        startupLog(`Tickets: ${tickets.status}`);
      } catch (error) {
        logger.error("Failed to set up the tickets:", error);
      }

      if (client.config?.features?.music) initRiffyAfterReady(client);
      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(`Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`);
      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(`Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds}, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}`);
      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(`Verification panel health: scanned ${verificationPanelSummary.scannedGuilds}, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}`);
      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(`Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels}, healthy ${reactionRolePanelSummary.healthyPanels}, missing channel ${reactionRolePanelSummary.missingChannels}`);
      // Level roles are found first so the sync below hands them to members who already passed their level.
      for (const guild of client.guilds.cache.values()) {
        try {
          const tiers = await findLevelTierRoles(client, guild);
          startupLog(`Level roles in ${guild.name}: found ${tiers.found}, missing ${tiers.missing.length}, rewards saved ${tiers.rewardsSaved}`);
        } catch (error) {
          logger.error(`Failed to find level roles in ${guild.name}:`, error);
        }
        // The CC store's trader role, made once above the Level 100 role (the owner asked for it), in our server only.
        if (isHomeGuild(guild.id)) {
          try {
            const trader = await ensureTraderRole(client, guild);
            startupLog(`Trader role in ${guild.name}: ${trader.status}`);
          } catch (error) {
            logger.error(`Failed to set up the trader role in ${guild.name}:`, error);
          }
        }
      }
      const levelRoleSummary = await reconcileLevelRoles(client);
      startupLog(`Level role sync: scanned ${levelRoleSummary.scannedGuilds}, pruned ${levelRoleSummary.prunedRewardEntries}, re-awarded ${levelRoleSummary.rolesReAwarded}, removed ${levelRoleSummary.rolesRemoved}, errors ${levelRoleSummary.errors}`);
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
