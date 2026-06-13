import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get detailed information about a user')
        .addUserOption(option =>
            option.setName('target').setDescription('The user to inspect (defaults to you)')
        ),

    async execute(interaction) {
        try {
            await InteractionHelper.safeDefer(interaction, { ephemeral: true });

            const user = await (interaction.options.getUser('target') ?? interaction.user).fetch();
            const member = interaction.guild?.members.cache.get(user.id)
                ?? await interaction.guild?.members.fetch(user.id).catch(() => null);

            const createdTs = Math.floor(user.createdAt.getTime() / 1000);
            const joinedTs = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

            const displayName = user.globalName ?? user.username;
            const nickname = member?.nickname;

            // Roles: exclude @everyone, sort by position
            const roles = member?.roles?.cache
                ?.filter(r => r.id !== interaction.guildId)
                ?.sort((a, b) => b.position - a.position);
            const roleCount = roles?.size ?? 0;
            const roleDisplay = roleCount
                ? roles.first(8).map(r => `<@&${r.id}>`).join(' ') + (roleCount > 8 ? ` +${roleCount - 8} more` : '')
                : 'None';

            const badges = [];
            const flags = user.flags?.toArray() ?? [];
            if (flags.includes('Staff'))                    badges.push('👨‍💼 Discord Staff');
            if (flags.includes('Partner'))                  badges.push('🤝 Partner');
            if (flags.includes('HypeSquadOnlineHouse1'))    badges.push('<:bravery:> HypeSquad Bravery');
            if (flags.includes('HypeSquadOnlineHouse2'))    badges.push('<:brilliance:> HypeSquad Brilliance');
            if (flags.includes('HypeSquadOnlineHouse3'))    badges.push('<:balance:> HypeSquad Balance');
            if (flags.includes('PremiumEarlySupporter'))    badges.push('🌟 Early Supporter');
            if (flags.includes('BugHunterLevel1'))          badges.push('🐛 Bug Hunter');
            if (flags.includes('BugHunterLevel2'))          badges.push('🐛 Bug Hunter Gold');
            if (flags.includes('ActiveDeveloper'))          badges.push('🛠️ Active Developer');
            if (flags.includes('VerifiedBotDeveloper'))     badges.push('✅ Verified Bot Developer');
            if (user.bot)                                   badges.push('🤖 Bot');
            if (member?.premiumSince)                       badges.push('💎 Server Booster');

            const avatarUrl = member?.displayAvatarURL({ size: 256 }) ?? user.displayAvatarURL({ size: 256 });
            const bannerUrl = user.bannerURL({ size: 1024 });

            const embed = createEmbed({ title: `👤 ${displayName}` })
                .setThumbnail(avatarUrl)
                .addFields(
                    { name: 'Username', value: `@${user.username}`, inline: true },
                    { name: 'User ID', value: user.id, inline: true },
                    { name: 'Nickname', value: nickname ?? 'None', inline: true },
                    { name: 'Account Created', value: `<t:${createdTs}:F>\n<t:${createdTs}:R>`, inline: true },
                    { name: 'Joined Server', value: joinedTs ? `<t:${joinedTs}:F>\n<t:${joinedTs}:R>` : 'Not in server', inline: true },
                    { name: `Roles (${roleCount})`, value: roleDisplay, inline: false },
                    { name: 'Highest Role', value: member?.roles?.highest?.id ? `<@&${member.roles.highest.id}>` : 'None', inline: true },
                );

            if (badges.length) embed.addFields({ name: 'Badges', value: badges.join('\n'), inline: true });
            if (bannerUrl) embed.setImage(bannerUrl);

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        } catch (error) {
            logger.error('UserInfo command failed', { error: error.message, userId: interaction.user.id });
            await handleInteractionError(interaction, error, { commandName: 'userinfo', source: 'userinfo_command' });
        }
    },
};
