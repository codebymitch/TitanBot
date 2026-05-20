import { PermissionsBitField, ChannelType } from 'discord.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../../services/guildConfig.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { logger } from '../../../utils/logger.js';
import { t } from '../../../services/i18n.js';

export default {
    async execute(interaction, config, client, lang) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.utility.report.permDeniedTitle'),
                    t(lang, 'wolf.cmd.utility.report.permDeniedDesc')
                )],
                ephemeral: true,
            });
        }

        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId;

        try {
            const guildConfig = await getGuildConfig(client, guildId);
            guildConfig.reportChannelId = channel.id;
            await setGuildConfig(client, guildId, guildConfig);

            return InteractionHelper.safeReply(interaction, {
                embeds: [successEmbed(
                    t(lang, 'wolf.cmd.utility.report.channelSetTitle'),
                    t(lang, 'wolf.cmd.utility.report.channelSetDesc', { channel: channel.toString() })
                )],
                ephemeral: true,
            });
        } catch (error) {
            logger.error('report_setchannel error:', error);
            return InteractionHelper.safeReply(interaction, {
                embeds: [errorEmbed(
                    t(lang, 'wolf.cmd.utility.report.dbErrorTitle'),
                    t(lang, 'wolf.cmd.utility.report.dbErrorDesc')
                )],
                ephemeral: true,
            });
        }
    },
};
