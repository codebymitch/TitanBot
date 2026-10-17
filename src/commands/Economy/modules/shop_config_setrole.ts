import type { SubcommandModule } from '../../../types/index.js';
import { PermissionsBitField, type GuildMember } from 'discord.js';
import { successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/config/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';

import { replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
export default {
    async execute(interaction, config, client) {
        if (!(interaction.member as GuildMember).permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return await replyUserError(interaction, { type: ErrorTypes.PERMISSION, message: 'Du brauchst die Berechtigung **Server verwalten**, um die Premium-Rolle festzulegen.' });
        }

        const role = interaction.options.getRole('role')!;
        const guildId = interaction.guildId!;

        try {
            const currentConfig = await getGuildConfig(client, guildId);
            currentConfig.premiumRoleId = role.id;
            await setGuildConfig(client, guildId, currentConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed('Premium-Rolle festgelegt', `Die **Premium-Shop-Rolle** ist jetzt ${role.toString()}. Mitglieder, die das Item „Premium-Rolle“ kaufen, erhalten diese Rolle.`)],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('shop_config_setrole error:', error);
            return await replyUserError(interaction, { type: ErrorTypes.UNKNOWN, message: 'Die Server-Konfiguration konnte nicht gespeichert werden.' });
        }
    },
} satisfies SubcommandModule;
