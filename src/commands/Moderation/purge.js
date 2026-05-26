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
        // 1. Kiểm tra lệnh này là Slash hay Prefix
        const isPrefix = interaction._isPrefix === true;
        
        if (!isPrefix) {
            await InteractionHelper.safeDefer(interaction);
        }

        // 2. Xử lý logic lấy amount (Prefix lấy từ args, Slash lấy từ options)
        let amount = isPrefix 
            ? parseInt(interaction.options.getInteger()) // Lấy từ context của prefixHandler
            : interaction.options.getInteger("amount");

        // 3. CHẶN LỖI 100 TIN NHẮN (Discord API limit)
        if (amount > 100) amount = 100;
        if (amount < 1) amount = 1;

        const channel = interaction.channel;

        try {
            const fetched = await channel.messages.fetch({ limit: amount + 1 });
            const messagesToDelete = Array.from(fetched.values()).slice(1);

            if (messagesToDelete.length === 0) {
                const err = errorEmbed("No messages found", "There are no messages available to delete.");
                return isPrefix ? await channel.send({ embeds: [err] }) : await InteractionHelper.safeEditReply(interaction, { embeds: [err] });
            }

            let deletedCount = 0;
            if (messagesToDelete.length === 1) {
                await messagesToDelete[0].delete();
                deletedCount = 1;
            } else {
                const deleted = await channel.bulkDelete(messagesToDelete, true);
                deletedCount = deleted.size;
            }

            const success = successEmbed(`🗑️ Successfully deleted ${deletedCount} messages.`);
            
            if (isPrefix) {
                const msg = await channel.send({ embeds: [success] });
                setTimeout(() => msg.delete().catch(() => {}), 3000);
            } else {
                await InteractionHelper.safeEditReply(interaction, { embeds: [success], flags: MessageFlags.Ephemeral });
                setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
            }

        } catch (error) {
            logger.error("Purge error:", error);
            const err = errorEmbed("Error", "Failed to delete messages. (Older than 14 days or system messages.)");
            isPrefix ? await channel.send({ embeds: [err] }) : await InteractionHelper.safeEditReply(interaction, { embeds: [err] });
        }
    }
};
