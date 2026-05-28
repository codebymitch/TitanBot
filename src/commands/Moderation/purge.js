import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Delete a specific amount of messages")
        .addIntegerOption((option) =>
            option.setName("amount")
                .setDescription("Number of messages (1-100)")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, config, client) {
        const isPrefix = interaction._isPrefix === true;

        if (!isPrefix) {
            await InteractionHelper.safeDefer(interaction);
        }

        let amount = interaction.options.getInteger("amount") ?? 10;
        
        // Validate amount
        if (!amount) {
            return InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Missing Parameter", "Please specify the amount of messages to delete.")],
            });
        }

        if (amount < 1) amount = 1;
        if (amount > 500) amount = 500; // Increased from 100 to 500

        const channel = interaction.channel;

        try {
            let deletedCount = 0;
            let remaining = amount;
            
            // Purge in batches to handle more than 100 messages
            while (remaining > 0) {
                const batchSize = Math.min(remaining, 100);
                // Fetch batchSize + 1 to account for the command message itself
                const fetched = await channel.messages.fetch({ limit: batchSize + 1 });
                const messagesToDelete = Array.from(fetched.values()).slice(0, batchSize);

                if (messagesToDelete.length === 0) {
                    break;
                }

                if (messagesToDelete.length === 1) {
                    await messagesToDelete[0].delete().catch(() => {});
                    deletedCount += 1;
                } else {
                    const deleted = await channel.bulkDelete(messagesToDelete, true).catch(() => {
                        // Fallback to deleting one by one if bulk delete fails
                        return Promise.all(
                            messagesToDelete.map(m => m.delete().catch(() => {}))
                        ).then(() => ({ size: messagesToDelete.length }));
                    });
                    deletedCount += deleted?.size || 0;
                }
                
                remaining -= messagesToDelete.length;
            }
            
            if (deletedCount === 0) {
                return InteractionHelper.safeEditReply(interaction, {
                    embeds: [errorEmbed("No messages found", "There are no messages available to delete.")],
                });
            }

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(`🗑️ Successfully deleted ${deletedCount} messages.`)],
                flags: isPrefix ? undefined : MessageFlags.Ephemeral,
            });

            setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
        } catch (error) {
            logger.error("Purge error:", error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Error", "Failed to delete messages. (Older than 14 days or system messages.)")],
            });
        }
    }
};
