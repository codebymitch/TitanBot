import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Issue a staff promotion')
        .addStringOption(option =>
            option
                .setName('supervisor')
                .setDescription('The supervisor issuing the promotion')
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName('staff_member')
                .setDescription('The staff member being promoted')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('old_rank')
                .setDescription('Their previous rank')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('new_rank')
                .setDescription('Their new rank')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the promotion')
                .setRequired(true)
        ),
    category: 'Staff',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn('Promotion interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'promotion'
            });
            return;
        }

        try {
            const supervisor = interaction.options.getString('supervisor');
            const staffMember = interaction.options.getUser('staff_member');
            const oldRank = interaction.options.getString('old_rank');
            const newRank = interaction.options.getString('new_rank');
            const reason = interaction.options.getString('reason');

            const description = [
                `**Supervisor:** ${supervisor}`,
                `**Staff Member:** ${staffMember}`,
                `**Previous Rank:** ${oldRank}`,
                `**New Rank:** ${newRank}`,
                `**Reason:** ${reason}`,
                ``,
                `Congratulations to **${staffMember.username}** on their promotion! Thank you for your dedication and contributions to California State Roleplay. We look forward to seeing your continued success in your new position.`,
                ``,
                `*Issued by California State Roleplay Management.*`
            ].join('\n');

            const embed = createEmbed({
                title: '🎉 STAFF PROMOTION 🎉',
                description,
                color: 'success',
                timestamp: true
            });

            await interaction.channel.send({ embeds: [embed] });

            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ Promotion notice posted successfully!'
            });
        } catch (error) {
            logger.error('Promotion command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'promotion_failed' });
        }
    }
};
