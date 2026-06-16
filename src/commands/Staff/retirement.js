import { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('retirement')
        .setDescription('Issue a staff retirement notice')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option =>
            option
                .setName('staff_member')
                .setDescription('The staff member retiring')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('final_rank')
                .setDescription('Their final rank/position')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for retirement')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('supervisor')
                .setDescription('Who approved the retirement')
                .setRequired(true)
        ),
    category: 'Staff',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn('Retirement interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'retirement'
            });
            return;
        }

        try {
            const staffMember = interaction.options.getUser('staff_member');
            const finalRank = interaction.options.getString('final_rank');
            const reason = interaction.options.getString('reason');
            const supervisor = interaction.options.getString('supervisor');

            const date = new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const description = [
                `> <:arrow:1516172552592949350> **Staff Member:** ${staffMember}`,
                `> <:arrow:1516172552592949350> **Final Rank:** ${finalRank}`,
                `> <:arrow:1516172552592949350> **Reason:** ${reason}`,
                `> <:arrow:1516172552592949350> **Issued By:** *Califirnia State Roleplay Management*`,
                `> <:arrow:1516172552592949350> **Issued At:** ${date}`
            ].join('\n');

            const embed = createEmbed({
                description,
                image: 'https://cdn.discordapp.com/attachments/1493023004802679007/1516162282663710730/Copy_of_Copy_of_Copy_of_Free_Release_Banner.png?ex=6a31a3a9&is=6a305229&hm=80d58b0354ff30b5d39c47d68b2cb2c8f965546929a9797b3de92cc7666a622b',
                timestamp: true
            });

            await interaction.channel.send({ embeds: [embed] });

            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ Retirement notice posted successfully!'
            });
        } catch (error) {
            logger.error('Retirement command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'retirement_failed' });
        }
    }
};
