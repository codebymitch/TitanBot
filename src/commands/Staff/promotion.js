import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
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

            const now = new Date();
            const issuedAt = now.toLocaleString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).replace(',', '').replace(/(\d{4}),/, '$1 at');

            const description = [
                `> <:arrow:1516172552592949350> **Staff Member:** ${staffMember}`,
                `> <:arrow:1516172552592949350> **Promoted To:** ${newRank}`,
                `> <:arrow:1516172552592949350> **Reason:** ${reason}`,
                `> <:arrow:1516172552592949350> **Issued By:** ${supervisor}`,
                `> <:arrow:1516172552592949350> **Issued At:** ${issuedAt}`
            ].join('\n');

            const embed = createEmbed({
                description,
                image: 'https://cdn.discordapp.com/attachments/1493023004802679007/1516161046790930554/Copy_of_Free_Release_Banner_1.png?ex=6a31a282&is=6a305102&hm=2c65693227f03abed5e168f188d8cc0ae0dde1716245cd6e37dc0892866430b7',
                thumbnail: 'https://cdn.discordapp.com/attachments/1516147294708170923/1516170857456603178/image.png?ex=6a31aba5&is=6a305a25&hm=30778fe62ec9c53307bcc806ceb494d75ba1333787b2bfccb6bea208dd372d45',
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
