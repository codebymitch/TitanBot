import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Tools/randomuser.js
export default {
    data: new SlashCommandBuilder()
        .setName('randomuser')
        .setDescription('Select a random user from the server')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Limit selection to users with this role')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('bots')
                .setDescription('Include bots in the selection (default: false)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('online')
                .setDescription('Only select from online users (default: false)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('mention')
                .setDescription('Mention the selected user (default: true)')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply();
            
            // Check if the command is used in a server
            if (!interaction.guild) {
                return interaction.editReply({
                    embeds: [errorEmbed('Error', 'This command can only be used in a server.')],
                    ephemeral: true
                });
            }
            
            // Get options
            const role = interaction.options.getRole('role');
            const includeBots = interaction.options.getBoolean('bots') || false;
            const onlineOnly = interaction.options.getBoolean('online') || false;
            const shouldMention = interaction.options.getBoolean('mention') ?? true;
            
            // Fetch all members to ensure we have the full list
            await interaction.guild.members.fetch();
            
            // Filter members based on options
            let members = interaction.guild.members.cache.filter(member => {
                // Skip bots unless explicitly included
                if (member.user.bot && !includeBots) return false;
                
                // Skip offline users if onlineOnly is true
                if (onlineOnly && member.presence?.status === 'offline') return false;
                
                // Check role if specified
                if (role && !member.roles.cache.has(role.id)) return false;
                
                return true;
            });
            
            // Convert to array and filter out the bot itself if needed
            let memberArray = Array.from(members.values());
            
            // Remove the bot itself from the selection if includeBots is false
            if (!includeBots) {
                memberArray = memberArray.filter(member => !member.user.bot);
            }
            
            // Check if we have any members to choose from
            if (memberArray.length === 0) {
                let errorMessage = 'No users found matching the criteria.';
                if (role) errorMessage += ` No users have the ${role.name} role.`;
                if (onlineOnly) errorMessage += ' No online users found.';
                
                return interaction.editReply({
                    embeds: [errorEmbed('No Users Found', errorMessage)],
                    ephemeral: true
                });
            }
            
            // Select a random member
            const randomIndex = Math.floor(Math.random() * memberArray.length);
            const selectedMember = memberArray[randomIndex];
            
            // Get user information
            const user = selectedMember.user;
            const joinDate = selectedMember.joinedAt;
            const roles = selectedMember.roles.cache
                .filter(role => role.id !== interaction.guild.id) // Remove @everyone role
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString())
                .slice(0, 10); // Limit to 10 roles to avoid embed field limits
            
            // Create the embed
            const embed = successEmbed(
                '🎲 Random User Selected',
                shouldMention ? `${selectedMember}` : `**${user.tag}**`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Username', value: user.tag, inline: true },
                { name: '🆔 User ID', value: user.id, inline: true },
                { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                { name: '📆 Joined Server', value: joinDate ? `<t:${Math.floor(joinDate.getTime() / 1000)}:R>` : 'Unknown', inline: true },
                { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true },
                { name: `🎭 Roles (${roles.length})`, value: roles.length > 0 ? roles.join(' ') : 'No roles', inline: false }
            )
            .setColor(selectedMember.displayHexColor || '#3498db');
            
            // Add status information if available
            if (selectedMember.presence) {
                let status = selectedMember.presence.status;
                let statusText = status.charAt(0).toUpperCase() + status.slice(1);
                
                // Get custom status or activity
                let activity = '';
                if (selectedMember.presence.activities.length > 0) {
                    const activities = selectedMember.presence.activities;
                    const customStatus = activities.find(a => a.type === 'CUSTOM');
                    const playingActivity = activities.find(a => a.type === 'PLAYING');
                    const streamingActivity = activities.find(a => a.type === 'STREAMING');
                    const listeningActivity = activities.find(a => a.type === 'LISTENING');
                    const watchingActivity = activities.find(a => a.type === 'WATCHING');
                    const competingActivity = activities.find(a => a.type === 'COMPETING');
                    
                    if (customStatus && customStatus.state) {
                        activity = `**Custom Status:** ${customStatus.state}`;
                    } else if (streamingActivity) {
                        activity = `**Streaming:** [${streamingActivity.name}](${streamingActivity.url})`;
                    } else if (listeningActivity) {
                        activity = `**Listening to:** ${listeningActivity.name}`;
                        if (listeningActivity.details) activity += ` - ${listeningActivity.details}`;
                    } else if (watchingActivity) {
                        activity = `**Watching:** ${watchingActivity.name}`;
                    } else if (playingActivity) {
                        activity = `**Playing:** ${playingActivity.name}`;
                    } else if (competingActivity) {
                        activity = `**Competing in:** ${competingActivity.name}`;
                    }
                }
                
                embed.addFields(
                    { name: '🟢 Status', value: statusText, inline: true },
                    { name: activity ? '💬 Activity' : '\u200B', value: activity || '\u200B', inline: true }
                );
            }
            
            // Add a button to pick another user
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`randomuser_${interaction.id}_again`)
                        .setLabel('🎲 Pick Another User')
                        .setStyle(ButtonStyle.Primary)
                );
            
            // Send the response
            const response = await interaction.editReply({
                content: shouldMention ? `${selectedMember}, you've been chosen!` : null,
                embeds: [embed],
                components: [row],
                allowedMentions: { users: shouldMention ? [user.id] : [] }
            });
            
            // Set up a collector for the button
            const filter = (i) => i.customId === `randomuser_${interaction.id}_again` && i.user.id === interaction.user.id;
            const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes
            
            collector.on('collect', async (i) => {
                try {
                    // Defer the update
                    await i.deferUpdate();
                    
                    // Run the command again with the same options
                    await this.execute({
                        ...interaction,
                        options: {
                            getRole: (name) => interaction.options.getRole(name),
                            getBoolean: (name) => interaction.options.getBoolean(name)
                        },
                        editReply: (response) => {
                            // Update the original message with the new result
                            return interaction.editReply(response);
                        },
                        deferReply: () => Promise.resolve(),
                        user: interaction.user,
                        channel: interaction.channel,
                        guild: interaction.guild
                    });
                    
                } catch (error) {
                    console.error('Button interaction error:', error);
                    await i.followUp({
                        content: 'An error occurred while selecting another user.',
                        ephemeral: true
                    });
                }
            });
            
            collector.on('end', () => {
                // Disable the button when the collector ends
                const disabledRow = ActionRowBuilder.from(row).setComponents(
                    ButtonBuilder.from(row.components[0]).setDisabled(true)
                );
                
                interaction.editReply({ components: [disabledRow] }).catch(console.error);
            });
            
        } catch (error) {
            console.error('RandomUser command error:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Failed to select a random user. Please try again.')],
                ephemeral: true
            });
        }
    },
};
