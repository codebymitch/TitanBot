import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('infraction')
        .setDescription('Issue a staff infraction notice')
        .addStringOption(option =>
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
        .addStringOption(option =>
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
            const supervisor = interaction.options.getString('supervisor');
            const staffMember = interaction.options.getUser('staff_member');
            const infractionRole = interaction.options.getString('infraction_role');
            const reason = interaction.options.getString('reason');

            const date = new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const description = [
                `**Supervisor:** ${supervisor}`,
                `**Staff Member:** ${staffMember}`,
                `**Infraction:** ${infractionRole}`,
                `**Reason:** ${reason}`,
                `**Date Issued:** ${date}`,
                ``,
                `An infraction has been issued to **${staffMember.username}** for failing to meet the standards and expectations of the California State Roleplay Staff Team.`,
                ``,
                `This infraction has been documented and added to the staff member's record. Further disciplinary action may be taken if additional violations occur.`,
                ``,
                `*Issued by California State Roleplay Management.*`
            ].join('\n');

            const embed = createEmbed({
                title: '⚠️ STAFF INFRACTION NOTICE ⚠️',
                description,
                color: 'warning',
                timestamp: true
            });

            await interaction.channel.send({ embeds: [embed] });

            await InteractionHelper.safeEditReply(interaction, {
                content: '✅ Infraction notice posted successfully!'
            });
        } catch (error) {
            logger.error('Infraction command error:', error);
            await handleInteractionError(interaction, error, { subtype: 'infraction_failed' });
        }
    }
};
