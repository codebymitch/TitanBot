import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('promotion')
        .setDescription('Issue a staff promotion')
        .addUserOption(option =>
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
        .addRoleOption(option =>
            option
                .setName('old_rank')
                .setDescription('Their previous rank')
                .setRequired(true)
        )
        .addRoleOption(option =>
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
            const supervisor = interaction.options.getUser('supervisor');
            const staffMember = interaction.options.getUser('staff_member');
            const oldRank = interaction.options.getRole('old_rank');
            const newRank = interaction.options.getRole('new_rank');
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
                color: 0x2C2F33,
                image: 'https://cdn.discordapp.com/attachments/1493023004802679007/1516161046790930554/Copy_of_Free_Release_Banner_1.png?ex=6a31a282&is=6a305102&hm=2c65693227f03abed5e168f188d8cc0ae0dde1716245cd6e37dc0892866430b7',
                timestamp: true
            });

            await interaction.channel.send({ embeds: [embed] });

            // Fetch the staff member as a GuildMember to perform role operations
            const staffMemberGuildMember = await interaction.guild.members.fetch(staffMember.id);

            try {
                await staffMemberGuildMember.roles.remove(oldRank, `Promotion: removed old rank by ${interaction.user.tag}`);
                logger.info('Promotion: removed old rank role', {
                    userId: staffMember.id,
                    roleId: oldRank.id,
                    roleName: oldRank.name,
                    issuedBy: interaction.user.id,
                    guildId: interaction.guildId
                });

                await staffMemberGuildMember.roles.add(newRank, `Promotion: added new rank by ${interaction.user.tag}`);
                logger.info('Promotion: added new rank role', {
                    userId: staffMember.id,
                    roleId: newRank.id,
                    roleName: newRank.name,
                    issuedBy: interaction.user.id,
                    guildId: interaction.guildId
                });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `✅ Promotion notice posted and roles updated — removed **${oldRank.name}** and assigned **${newRank.name}** to ${staffMember}.`
                });
            } catch (roleError) {
                logger.error('Promotion: failed to update roles', {
                    userId: staffMember.id,
                    oldRoleId: oldRank.id,
                    newRoleId: newRank.id,
                    error: roleError.message,
                    guildId: interaction.guildId
                });

                await InteractionHelper.safeEditReply(interaction, {
                    content: `⚠️ Promotion notice posted, but role update failed: ${roleError.message}. Please update the roles manually.`
                });
            }
        } catch (error) {
            logger.error('Promotion command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'promotion_failed' });
        }
    }
};
