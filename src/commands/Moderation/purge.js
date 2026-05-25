import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logEvent } from '../../utils/moderation.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getColor } from '../../config/bot.js';

export default {
    data: new SlashCommandBuilder()
        .setName("purge")
        .setDescription("Delete a specific amount of messages")
        .addIntegerOption((option) =>
            option.setName("amount").setDescription("Number of messages (1-100)").setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    category: "moderation",

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const amount = interaction.options.getInteger("amount");
        const channel = interaction.channel;

        try {
            let deletedCount = 0;
            const fetched = await channel.messages.fetch({ limit: amount });

            if (amount === 1) {
                const messageToDelete = fetched.first();
                if (messageToDelete) {
                    await messageToDelete.delete();
                    deletedCount = 1;
                }
            } else {
                const deleted = await channel.bulkDelete(fetched, true);
                deletedCount = deleted.size;
            }

            // CHỖ NÀY QUAN TRỌNG: Nếu không xóa được gì, dừng lại ngay và không Log
            if (deletedCount === 0) {
                return await InteractionHelper.safeEditReply(interaction, {
                    embeds: [warningEmbed("No messages deleted", "Could not delete messages. They might be older than 14 days or are system messages.")],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Chỉ Log khi đã thực sự xóa được tin nhắn
            await logEvent({
                client,
                guild: interaction.guild,
                event: {
                    action: "Messages Purged",
                    target: `${channel} (${deletedCount} messages)`,
                    executor: `${interaction.user.tag}`,
                    reason: `Deleted ${deletedCount} messages`,
                }
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [successEmbed(`🗑️ Successfully deleted ${deletedCount} messages.`)],
                flags: MessageFlags.Ephemeral,
            });

            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 3000);

        } catch (error) {
            logger.error('Purge error:', error);
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed("Error", `Failed: ${error.message}`)],
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};
