import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName("lock")
        .setDescription("Lock the channel for all roles")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction, config, client) {
        const isPrefix = interaction._isPrefix === true;

        if (!isPrefix) {
            await InteractionHelper.safeDefer(interaction);
        }

        const channel = interaction.channel;
        const guild = interaction.guild;

        try {
            const overwrites = channel.permissionOverwrites.cache;
            const roleIds = [...overwrites.keys(), guild.roles.everyone.id];
            
            for (const id of roleIds) {
                try {
                    await channel.permissionOverwrites.edit(id, { SendMessages: false });
                } catch (e) {
                    logger.debug(`Skipping role ${id}: ${e.message}`);
                }
            }

            // PHẢN HỒI DỰA VÀO LOẠI LỆNH
            const embed = successEmbed("🔒 Channel locked successfully.");
            
            if (isPrefix) {
                await channel.send({ embeds: [embed] });
            } else {
                await InteractionHelper.safeEditReply(interaction, {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                });
            }

        } catch (error) {
            logger.error("Critical lock error:", error);
            const errEmbed = errorEmbed("Error", "Failed to process lock command.");
            
            if (isPrefix) {
                await channel.send({ embeds: [errEmbed] });
            } else {
                await InteractionHelper.safeEditReply(interaction, { embeds: [errEmbed] });
            }
        }
    }
};
