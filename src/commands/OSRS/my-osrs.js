import { SlashCommandBuilder } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { withErrorHandling } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { getEconomyData, formatCurrency } from '../../utils/economy.js';
import { getActiveUserFights } from '../../utils/database/fights.js';
import { getOsrsLink } from '../../utils/database/osrs.js';
import { formatFightSummaryLine } from '../../utils/osrsStakingPresentation.js';

export default {
    data: new SlashCommandBuilder()
        .setName('my-osrs')
        .setDescription('View your linked OSRS username, wallet balance, and active fights'),

    execute: withErrorHandling(async (interaction, _config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

        const [link, economyData, fights] = await Promise.all([
            getOsrsLink(client, interaction.guildId, interaction.user.id),
            getEconomyData(client, interaction.guildId, interaction.user.id),
            getActiveUserFights(client, interaction.guildId, interaction.user.id),
        ]);

        if (!link) {
            await InteractionHelper.safeEditReply(interaction, {
                embeds: [errorEmbed('You have not linked an OSRS username yet. Use /link-osrs first.')],
            });
            return;
        }

        await InteractionHelper.safeEditReply(interaction, {
            embeds: [
                createEmbed({
                    title: 'My OSRS Profile',
                    color: 'info',
                    fields: [
                        { name: 'Linked Username', value: link.osrsUsername, inline: true },
                        { name: 'Wallet Balance', value: formatCurrency(economyData.wallet || 0, { short: true }), inline: true },
                        {
                            name: 'Active / Pending Fights',
                            value: fights.length > 0
                                ? fights.slice(0, 5).map((fight) => formatFightSummaryLine(fight, interaction.user.id)).join('\n')
                                : 'No active fights.',
                            inline: false,
                        },
                    ],
                }),
            ],
        });
    }, { command: 'my-osrs' }),
};
