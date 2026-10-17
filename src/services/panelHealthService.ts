import { logger } from '../utils/logger.js';
import { getReactionRoleKey } from '../utils/database/keys.js';
import { getGuildConfig, setGuildConfig, patchGuildConfig } from './config/guildConfig.js';
import {
    getTicketPanelStatus,
    getVerificationPanelStatus,
    getReactionRolePanelStatus,
} from '../utils/panelStatus.js';
import { getAllReactionRoleMessages } from './reactionRoleService.js';
import type { GuildConfig, NexoClient } from '../types/index.js';

/** Stored reaction-role panel fields this module reads/updates. */
interface ReactionRolePanelRef {
    channelId?: string | null;
    messageId?: string | null;
}

export interface PanelHealthSummary {
    scannedGuilds: number;
    scannedPanels?: number;
    healthyPanels: number;
    deletedPanels: number;
    missingChannels: number;
    recoveredIds: number;
    errors: number;
}

async function persistVerificationMessageId(client: NexoClient, guildId: string, config: GuildConfig, messageId: string): Promise<void> {
    if (!messageId || config.verification?.messageId === messageId) return;
    await patchGuildConfig(client, guildId, {
        verification: { ...config.verification, messageId },
    });
}

async function persistReactionRoleMessageId(client: NexoClient, guildId: string, panelData: ReactionRolePanelRef, messageId: string): Promise<void> {
    if (!messageId || panelData.messageId === messageId) return;
    // Callers only pass panels with a stored messageId.
    const oldKey = getReactionRoleKey(guildId, panelData.messageId!);
    panelData.messageId = messageId;
    const newKey = getReactionRoleKey(guildId, messageId);
    await client.db.set(newKey, panelData);
    await client.db.delete(oldKey).catch(() => {});
}

export async function reconcileTicketPanels(client: NexoClient): Promise<PanelHealthSummary> {
    const summary: PanelHealthSummary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(client, guild.id);
            if (!config?.ticketPanelChannelId) continue;

            const panelStatus = await getTicketPanelStatus(client, guild, config);

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;
                config.ticketPanelMessageId = panelStatus.recoveredId;
                await setGuildConfig(client, guild.id, config);
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (panelStatus.reason === 'channel_missing') {
                summary.missingChannels += 1;
                logger.warn(`Ticket panel channel missing for guild ${guild.id} (${guild.name})`);
            } else if (panelStatus.reason === 'panel_deleted') {
                summary.deletedPanels += 1;
                logger.warn(
                    `Ticket panel message deleted for guild ${guild.id} (${guild.name}) — admins can repost from /ticket dashboard`,
                );
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Ticket panel health check failed for guild ${guild.id}:`, (error as Error).message);
        }
    }

    return summary;
}

export async function reconcileVerificationPanels(client: NexoClient): Promise<PanelHealthSummary> {
    const summary: PanelHealthSummary = {
        scannedGuilds: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const config = await getGuildConfig(client, guild.id);
            const verification = config?.verification;
            if (!verification?.channelId || verification.enabled === false) continue;

            const panelStatus = await getVerificationPanelStatus(client, guild, verification);

            if (panelStatus.recoveredId) {
                summary.recoveredIds += 1;
                await persistVerificationMessageId(client, guild.id, config, panelStatus.recoveredId);
            }

            if (panelStatus.exists) {
                summary.healthyPanels += 1;
            } else if (panelStatus.reason === 'channel_missing') {
                summary.missingChannels += 1;
                logger.warn(`Verification panel channel missing for guild ${guild.id} (${guild.name})`);
            } else if (panelStatus.reason === 'panel_deleted') {
                summary.deletedPanels += 1;
                logger.warn(
                    `Verification panel deleted for guild ${guild.id} (${guild.name}) — repost from /verification dashboard`,
                );
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Verification panel health check failed for guild ${guild.id}:`, (error as Error).message);
        }
    }

    return summary;
}

export async function reconcileReactionRolePanelHealth(client: NexoClient): Promise<Required<PanelHealthSummary>> {
    const summary: Required<PanelHealthSummary> = {
        scannedGuilds: 0,
        scannedPanels: 0,
        healthyPanels: 0,
        deletedPanels: 0,
        missingChannels: 0,
        recoveredIds: 0,
        errors: 0,
    };

    for (const guild of client.guilds.cache.values()) {
        summary.scannedGuilds += 1;

        try {
            const panels: ReactionRolePanelRef[] = await getAllReactionRoleMessages(client, guild.id);
            if (!panels?.length) continue;

            for (const panelData of panels) {
                if (!panelData?.channelId || !panelData?.messageId) continue;
                summary.scannedPanels += 1;

                const panelStatus = await getReactionRolePanelStatus(client, guild, panelData);

                if (panelStatus.recoveredId) {
                    summary.recoveredIds += 1;
                    await persistReactionRoleMessageId(client, guild.id, panelData, panelStatus.recoveredId);
                }

                if (panelStatus.exists) {
                    summary.healthyPanels += 1;
                } else if (panelStatus.reason === 'channel_missing') {
                    summary.missingChannels += 1;
                    logger.warn(
                        `Reaction role panel channel missing for guild ${guild.id}, message ${panelData.messageId}`,
                    );
                } else if (panelStatus.reason === 'panel_deleted') {
                    summary.deletedPanels += 1;
                    logger.warn(
                        `Reaction role panel deleted for guild ${guild.id} — repost from /reactroles dashboard`,
                    );
                }
            }
        } catch (error) {
            summary.errors += 1;
            logger.warn(`Reaction role panel health check failed for guild ${guild.id}:`, (error as Error).message);
        }
    }

    return summary;
}
