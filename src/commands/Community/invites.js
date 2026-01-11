import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Cache for invite data
const inviteCache = new Map();

// Function to get all invites for a guild and cache them
async function fetchAndCacheInvites(guild) {
    try {
        const invites = await guild.invites.fetch({ cache: false });
        const invitesArray = Array.from(invites.values());
        inviteCache.set(guild.id, {
            invites: invitesArray,
            timestamp: Date.now()
        });
        return invitesArray;
    } catch (error) {
        console.error('Error fetching invites:', error);
        return [];
    }
}

// Function to get cached invites or fetch fresh ones if needed
async function getCachedInvites(guild, forceRefresh = false) {
    const cache = inviteCache.get(guild.id);
    
    // If no cache or cache is older than 5 minutes or force refresh
    if (!cache || forceRefresh || (Date.now() - cache.timestamp > 5 * 60 * 1000)) {
        return await fetchAndCacheInvites(guild);
    }
    
    return cache.invites;
}
export default {
    data: new SlashCommandBuilder()
        .setName('invites')
        .setDescription('Manage and view invite statistics')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.CreateInstantInvite)
        
        // View subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your invite statistics')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to view invite stats for (moderators only)')
                        .setRequired(false)
                )
        )
        
        // Leaderboard subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the invite leaderboard')
                .addIntegerOption(option =>
                    option
                        .setName('limit')
                        .setDescription('Number of users to show (default: 10)')
                        .setRequired(false)
                )
        )
        
        // Codes subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('codes')
                .setDescription('View your active invite codes')
        )
        
        // Details subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('details')
                .setDescription('View detailed information about your invites')
                .addStringOption(option =>
                    option
                        .setName('code')
                        .setDescription('The invite code to view details for')
                        .setRequired(false)
                )
        ),

    category: "Community",

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const { options, member, guild } = interaction;
        const subcommand = options.getSubcommand();
        
        try {
            switch (subcommand) {
                case 'view':
                    await handleView(interaction);
                    break;
                case 'leaderboard':
                    await handleLeaderboard(interaction);
                    break;
                case 'codes':
                    await handleCodes(interaction);
                    break;
                case 'details':
                    await handleDetails(interaction);
                    break;
            }
        } catch (error) {
            console.error('Error in invites command:', error);
            await interaction.editReply({
                embeds: [errorEmbed('An error occurred while processing your request.')]
            });
        }
    },
};

// Handle view subcommand
async function handleView(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    
    // Check permissions if viewing another user's stats
    if (targetUser.id !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply({
            embeds: [errorEmbed('You need the Manage Server permission to view other users\' invite stats.')]
        });
    }
    
    try {
        const stats = await getMemberInviteStats(
            interaction.client, 
            interaction.guild.id, 
            targetUser.id
        );
        
        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setAuthor({ 
                name: `Invite Stats for ${targetUser.tag}`, 
                iconURL: targetUser.displayAvatarURL() 
            })
            .addFields(
                { name: 'Total Invites', value: `\👥 ${stats.total}`, inline: true },
                { name: 'Valid Invites', value: `\✅ ${stats.valid}`, inline: true },
                { name: 'Fake/Invalid', value: `\❓ ${stats.fake}`, inline: true },
                { name: 'Left', value: `\🚪 ${stats.leaves}`, inline: true },
                { 
                    name: 'Invite Codes', 
                    value: stats.invites.length > 0 
                        ? `You have ${stats.invites.length} active invite codes`
                       : 'No active invite codes found',
                    inline: false 
                }
            )
            .setFooter({ 
                text: `Last updated: ${new Date().toLocaleString()}`,
                iconURL: interaction.client.user.displayAvatarURL()
            });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in view subcommand:', error);
        await interaction.editReply({
            embeds: [errorEmbed('Failed to fetch invite statistics. Please try again later.')]
        });
    }
}

// Handle leaderboard subcommand
async function handleLeaderboard(interaction) {
    const limit = Math.min(interaction.options.getInteger('limit') || 10, 25);
    
    try {
        const leaderboard = await getInviteLeaderboard(
            interaction.client,
            interaction.guild.id,
            limit
        );
        
        if (leaderboard.length === 0) {
            return interaction.editReply({
                embeds: [errorEmbed('No invite data available yet.')]
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Invite Leaderboard')
            .setColor('#FFD700')
            .setDescription('Top server recruiters based on valid invites')
            .setFooter({ 
                text: `Showing top ${leaderboard.length} recruiters`,
                iconURL: interaction.guild.iconURL()
            });
        
        const leaderboardText = leaderboard
            .map((entry, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '▫️';
                return `${medal} **${entry.position}.** ${entry.tag} - ${entry.valid} valid (${entry.total} total, ${entry.leaves} left, ${entry.fake} fake)`;
            })
            .join('\n');
        
        embed.addFields({
            name: 'Top Recruiters',
            value: leaderboardText
        });
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in leaderboard subcommand:', error);
        await interaction.editReply({
            embeds: [errorEmbed('Failed to fetch leaderboard. Please try again later.')]
        });
    }
}

// Handle codes subcommand
async function handleCodes(interaction) {
    try {
        const invites = await getCachedInvites(interaction.guild, true);
        const memberInvites = invites.filter(inv => inv.inviter?.id === interaction.user.id);
        
        if (memberInvites.length === 0) {
            return interaction.editReply({
                embeds: [errorEmbed('You don\'t have any active invite codes.')]
            });
        }
        
        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('Your Invite Codes')
            .setDescription('Here are your active invite codes:');
        
        for (const invite of memberInvites) {
            const expiresAt = invite.expiresAt ? time(new Date(invite.expiresAt), 'R') : 'Never';
            const maxUses = invite.maxUses ? `/${invite.maxUses}` : '∞';
            
            embed.addFields({
                name: `discord.gg/${invite.code}`,
                value: [
                    `• Uses: ${invite.uses || 0}${maxUses}`,
                    `• Expires: ${expiresAt}`,
                    `• Created: ${time(new Date(invite.createdAt), 'R')}`,
                    invite.temporary ? '• Temporary invite (kicks after 24h)' : ''
                ].filter(Boolean).join('\n')
            });
        }
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error in codes subcommand:', error);
        await interaction.editReply({
            embeds: [errorEmbed('Failed to fetch your invite codes. Please try again later.')]
        });
    }
}

// Handle details subcommand
async function handleDetails(interaction) {
    const codeOption = interaction.options.getString('code');
    
    try {
        if (codeOption) {
            // Show details for a specific invite code
            const details = await getInviteDetails(
                interaction.client,
                interaction.guild.id,
                codeOption
            );
            
            if (!details || details.uses === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed('No usage data found for this invite code.')]
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`Invite Details: ${details.code}`)
                .setColor('#7289DA')
                .setDescription(`Total uses: ${details.uses}`);
            
            // Group users by status
            const activeUsers = [];
            const leftUsers = [];
            
            for (const user of details.users) {
                if (user.left) {
                    leftUsers.push(`• ${user.tag} (Left)`);
                } else {
                    activeUsers.push(`• ${user.tag} (Joined ${time(new Date(user.joinedAt), 'R')})`);
                }
            }
            
            if (activeUsers.length > 0) {
                embed.addFields({
                    name: 'Active Members',
                    value: activeUsers.join('\n').slice(0, 1024),
                    inline: false
                });
            }
            
            if (leftUsers.length > 0) {
                embed.addFields({
                    name: 'Left Members',
                    value: leftUsers.join('\n').slice(0, 1024),
                    inline: false
                });
            }
            
            if (details.users.length > 0) {
                const lastUsed = new Date(Math.max(...details.users.map(u => u.joinedAt)));
                embed.setFooter({ 
                    text: `Last used: ${time(lastUsed, 'R')}`,
                    iconURL: interaction.guild.iconURL()
                });
            }
            
            await interaction.editReply({ embeds: [embed] });
        } else {
            // Show a list of the user's invites with basic stats
            const invites = await getCachedInvites(interaction.guild);
            const memberInvites = invites.filter(inv => inv.inviter?.id === interaction.user.id);
            
            if (memberInvites.length === 0) {
                return interaction.editReply({
                    embeds: [errorEmbed('You don\'t have any active invite codes.')]
                });
            }
            
            const embed = new EmbedBuilder()
                .setTitle('Your Invite Codes')
                .setColor('#7289DA')
                .setDescription('Click on a code to view detailed information');
            
            const buttons = [];
            
            for (const invite of memberInvites.slice(0, 5)) { // Max 5 buttons
                const details = await getInviteDetails(
                    interaction.client,
                    interaction.guild.id,
                    invite.code
                );
                
                const activeUsers = details.users.filter(u => !u.left).length;
                const leftUsers = details.users.length - activeUsers;
                
                embed.addFields({
                    name: `discord.gg/${invite.code}`,
                    value: [
                        `• Uses: ${details.uses}`,
                        `• Active: ${activeUsers}`,
                        `• Left: ${leftUsers}`,
                        `• Created: ${time(new Date(invite.createdAt), 'R')}`
                    ].join('\n'),
                    inline: true
                });
                
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`invite_details_${invite.code}`)
                        .setLabel(invite.code)
                        .setStyle(ButtonStyle.Secondary)
                );
            }
            
            const actionRow = new ActionRowBuilder().addComponents(buttons);
            
            await interaction.editReply({ 
                embeds: [embed],
                components: buttons.length > 0 ? [actionRow] : []
            });
        }
    } catch (error) {
        console.error('Error in details subcommand:', error);
        await interaction.editReply({
            embeds: [errorEmbed('Failed to fetch invite details. Please try again later.')]
        });
    }
}
