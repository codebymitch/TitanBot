import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getActiveUserFights } from '../../utils/database/fights.js';
import { getOsrsLink, unlinkOsrsUsername } from '../../utils/database/osrs.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unlink-osrs')
        .setDescription('Unlink your OSRS username from your Discord account'),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const [link, fights] = await Promise.all([
            getOsrsLink(client, interaction.guildId, interaction.user.id),
            getActiveUserFights(client, interaction.guildId, interaction.user.id),
        ]);

        if (!link) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('You do not currently have an OSRS username linked.')] });
            return;
        }

        if (fights.length > 0) {
            await InteractionHelper.safeEditReply(interaction, { embeds: [errorEmbed('You cannot unlink your OSRS username while you have pending or active fights.')] });
            return;
        }

        await unlinkOsrsUsername(client, interaction.guildId, interaction.user.id);
        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: 'OSRS Username Unlinked',
                    description: `Removed **${link.osrsUsername}** from your Discord account.`,
                    color: 'success',
                }),
            ],
        });
    }, { command: 'unlink-osrs' }),
};
