import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const VERIFICATION = ['None', 'Low', 'Medium', 'High', '🔒 Highest'];
const CONTENT_FILTER = ['Disabled', 'Members without roles', 'All members'];
const BOOST_TIERS = ['No tier', 'Tier 1', 'Tier 2', 'Tier 3'];

export default {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Get detailed information about the server'),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction, { ephemeral: false });

            const guild = interaction.guild;
            await guild.fetch();

            const owner = await guild.fetchOwner().catch(() => null);
            const createdTs = Math.floor(guild.createdAt.getTime() / 1000);

            const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
            const categories = guild.channels.cache.filter(c => c.type === 4).size;

            const embed = createEmbed({
                title: `🏰 ${guild.name}`,
                description: guild.description ?? '',
            })
                .setThumbnail(guild.iconURL({ size: 256 }))
                .addFields(
                    { name: 'Owner', value: owner ? `<@${owner.id}>` : 'Unknown', inline: true },
                    { name: 'Server ID', value: guild.id, inline: true },
                    { name: 'Created', value: `<t:${createdTs}:F>\n<t:${createdTs}:R>`, inline: true },
                    { name: 'Members', value: `${guild.memberCount.toLocaleString()}`, inline: true },
                    { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: 'Boosts', value: `${BOOST_TIERS[guild.premiumTier]} (${guild.premiumSubscriptionCount ?? 0} boosts)`, inline: true },
                    { name: 'Channels', value: `💬 ${textChannels} text  🔊 ${voiceChannels} voice  📁 ${categories} categories`, inline: false },
                    { name: 'Emojis', value: `${guild.emojis.cache.size}`, inline: true },
                    { name: 'Stickers', value: `${guild.stickers.cache.size}`, inline: true },
                    { name: 'Verification', value: VERIFICATION[guild.verificationLevel] ?? 'Unknown', inline: true },
                    { name: 'Explicit Filter', value: CONTENT_FILTER[guild.explicitContentFilter] ?? 'Unknown', inline: true },
                );

            const bannerUrl = guild.bannerURL({ size: 1024 });
            if (bannerUrl) embed.setImage(bannerUrl);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('ServerInfo command failed', { error: error.message, guildId: interaction.guildId });
            await handleInteractionError(interaction, error, { commandName: 'serverinfo', source: 'serverinfo_command' });
        }
    },
};
