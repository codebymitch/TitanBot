import { PermissionsBitField, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { setLogChannel } from '../../../services/loggingService.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import type { SubcommandModule } from '../../../types/index.js';
export default {
    async execute(interaction, config, client) {
        if (!(interaction.member as GuildMember).permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um den Meldekanal festzulegen.' });
        }

        const channel = interaction.options.getChannel('channel')!;
        const guildId = interaction.guildId!;

        try {
            await setLogChannel(client, guildId, 'reports', channel.id);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(
                    'Meldekanal festgelegt',
                    `Alle neuen Meldungen gehen ab jetzt an ${channel}.\nDu kannst das auch über \`/logging dashboard\` verwalten.`,
                )],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('report_setchannel error:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Kanal-Einstellung konnte nicht gespeichert werden.' });
        }
    },
} satisfies SubcommandModule;
