import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('infraction')
        .setDescription('Issue a staff infraction notice')
        .addUserOption(option =>
            option
                .setName('supervisor')
                .setDescription('The supervisor issuing the infraction')
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName('staff_member')
                .setDescription('The staff member receiving the infraction')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('infraction_role')
                .setDescription('The type of infraction')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for the infraction')
                .setRequired(true)
        ),
    category: 'Staff',

    async execute(interaction, config, client) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        if (!deferSuccess) {
            logger.warn('Infraction interaction defer failed', {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'infraction'
            });
            return;
        }

        try {
            const supervisor = interaction.options.getUser('supervisor');
            const staffMember = interaction.options.getUser('staff_member');
            const infractionRole = interaction.options.getRole('infraction_role');
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
                `> <:arrow:1516172552592949350> **Infraction:** ${infractionRole}`,
                `> <:arrow:1516172552592949350> **Reason:** ${reason}`,
                `> <:arrow:1516172552592949350> **Issued By:** ${supervisor}`,
                `> <:arrow:1516172552592949350> **Issued At:** ${issuedAt}`,
                `-# Find the infraction invalid? Please contact us in the Internal Affairs Support.`
            ].join('\n');

            const embed = createEmbed({
                description,
                color: 0x1a1a1a,
                image: 'https://cdn.discordapp.com/attachments/1493023004802679007/1516162356617547937/Copy_of_Copy_of_Free_Release_Banner_1.png?ex=6a31a3ba&is=6a30523a&hm=57a86c8192b237d4bd4a4492d752c96fc555d3b7f15e46dbfcb2e72e14a1593d',
                timestamp: true
            });

            await interaction.channel.send({ embeds: [embed] });

            // Assign the infraction role to the staff member
            try {
                const staffMemberGuildMember = await interaction.guild.members.fetch(staffMember.id);
                await staffMemberGuildMember.roles.add(infractionRole);
                logger.info('Infraction role assigned to staff member', {
                    staffMemberId: staffMember.id,
                    staffMemberTag: staffMember.tag,
                    roleId: infractionRole.id,
                    roleName: infractionRole.name,
                    issuedBy: interaction.user.id,
                    guildId: interaction.guildId
                });
            } catch (roleError) {
                logger.error('Failed to assign infraction role to staff member', {
                    staffMemberId: staffMember.id,
                    roleId: infractionRole.id,
                    guildId: interaction.guildId,
                    error: roleError
                });
                await InteractionHelper.safeEditReply(interaction, {
                    content: '⚠️ Infraction notice posted, but the infraction role could not be assigned. Please check my permissions and role hierarchy.'
                });
                return;
            }

            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ Infraction notice posted and role assigned successfully!'
            });
        } catch (error) {
            logger.error('Infraction command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'infraction_failed' });
        }
    }
};
