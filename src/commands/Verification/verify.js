import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { verifyUser } from '../../services/verificationService.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { t, pickLanguage } from '../../services/i18n.js';

export default {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify yourself and gain access to the server'),

    async execute(interaction, config, client) {
        const lang = pickLanguage(config, interaction.guild);
        const wrappedExecute = withErrorHandling(async () => {
            const guild = interaction.guild;

            const result = await verifyUser(client, guild.id, interaction.user.id, {
                source: 'command_self',
                moderatorId: null
            });

            if (!result.success) {
                if (result.alreadyVerified) {
                    return await InteractionHelper.safeReply(interaction, {
                        embeds: [infoEmbed(t(lang, 'wolf.cmd.verify.alreadyTitle'), t(lang, 'wolf.cmd.verify.alreadyDesc'))],
                        flags: MessageFlags.Ephemeral
                    });
                }

                return await InteractionHelper.safeReply(interaction, {
                    embeds: [errorEmbed(t(lang, 'wolf.cmd.verify.failedTitle'), t(lang, 'wolf.cmd.verify.failedDesc'))],
                    flags: MessageFlags.Ephemeral
                });
            }

            await InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(t(lang, 'wolf.cmd.verify.completeTitle'), t(lang, 'wolf.cmd.verify.completeDesc', { role: result.roleName }))],
                flags: MessageFlags.Ephemeral
            });
        }, { command: 'verify' });

        return await wrappedExecute(interaction, config, client);
    }
};
