import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
                .setDescription('Mention the selected user (default: false)')
                .setRequired(false)),

    async execute(interaction) {
try {
            if (!interaction.guild) {
                return interaction.reply({
                    embeds: [errorEmbed('Error', 'This command can only be used in a server.')],
                    flags: ["Ephemeral"]
                });
            }
            
            const role = interaction.options.getRole('role');
            const includeBots = interaction.options.getBoolean('bots') || false;
            const onlineOnly = interaction.options.getBoolean('online') || false;
            const shouldMention = interaction.options.getBoolean('mention') || false;
            
            let members = interaction.guild.members.cache.filter(member => {
                if (member.user.bot && !includeBots) return false;
                
                if (onlineOnly && member.presence?.status === 'offline') return false;
                
                if (role && !member.roles.cache.has(role.id)) return false;
                
                return true;
            });
            
            let memberArray = Array.from(members.values());
            
            if (!includeBots) {
                memberArray = memberArray.filter(member => !member.user.bot);
            }
            
            if (memberArray.length === 0) {
                let errorMessage = 'No users found matching the criteria.';
                if (role) errorMessage += ` No users have the ${role.name} role.`;
                if (onlineOnly) errorMessage += ' No online users found.';
                
                return interaction.editReply({
                    embeds: [errorEmbed('No Users Found', errorMessage)],
                    flags: ["Ephemeral"]
                });
            }
            
            const randomIndex = Math.floor(Math.random() * memberArray.length);
            const selectedMember = memberArray[randomIndex];
            
            const user = selectedMember.user;
            const joinDate = selectedMember.joinedAt;
            const roles = selectedMember.roles.cache
.filter(role => role.id !== interaction.guild.id)
                .sort((a, b) => b.position - a.position)
                .map(role => role.toString())
.slice(0, 10);
            
            const embed = successEmbed(
                '🎲 Random User Selected',
                shouldMention ? `${selectedMember}` : `**${user.username}**`
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .addFields(
                { name: '👤 Username', value: user.username, inline: true },
                { name: '🤖 Bot', value: user.bot ? 'Yes' : 'No', inline: true },
                { name: `🎭 Roles (${roles.length})`, value: roles.length > 0 ? roles.slice(0, 5).join(' ') + (roles.length > 5 ? ` +${roles.length - 5} more` : '') : 'No roles', inline: false }
            )
            .setColor(selectedMember.displayHexColor || '#3498db');
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`randomuser_${interaction.user.id}_again`)
                        .setLabel('🎲 Pick Another User')
                        .setStyle(ButtonStyle.Primary)
                );
            
            const response = await interaction.editReply({
                content: shouldMention ? `${selectedMember}, you've been chosen!` : null,
                embeds: [embed],
                components: [row],
                allowedMentions: { users: shouldMention ? [user.id] : [] }
            });
            
            const filter = (i) => i.customId === `randomuser_${interaction.user.id}_again` && i.user.id === interaction.user.id;
const collector = response.createMessageComponentCollector({ filter, time: 300000 });
            
            collector.on('collect', async (i) => {
                try {
                    let newMembers = interaction.guild.members.cache.filter(member => {
                        if (member.user.bot && !includeBots) return false;
                        
                        if (onlineOnly && member.presence?.status === 'offline') return false;
                        
                        if (role && !member.roles.cache.has(role.id)) return false;
                        
                        return true;
                    });
                    
                    let newMemberArray = Array.from(newMembers.values());
                    
                    if (!includeBots) {
                        newMemberArray = newMemberArray.filter(member => !member.user.bot);
                    }
                    
                    if (newMemberArray.length === 0) {
                        await i.update({
                            embeds: [errorEmbed('No Users Found', 'No users found matching the criteria.')],
                            components: [row]
                        });
                        return;
                    }
                    
                    const newRandomIndex = Math.floor(Math.random() * newMemberArray.length);
                    const newSelectedMember = newMemberArray[newRandomIndex];
                    const newUser = newSelectedMember.user;
                    
                    const newRoles = newSelectedMember.roles.cache
                        .filter(r => r.id !== interaction.guild.id)
                        .sort((a, b) => b.position - a.position)
                        .map(r => r.toString())
                        .slice(0, 10);
                    
                    const newEmbed = successEmbed(
                        '🎲 Random User Selected',
                        shouldMention ? `${newSelectedMember}` : `**${newUser.username}**`
                    )
                    .setThumbnail(newUser.displayAvatarURL({ dynamic: true, size: 256 }))
                    .addFields(
                        { name: '👤 Username', value: newUser.username, inline: true },
                        { name: '🤖 Bot', value: newUser.bot ? 'Yes' : 'No', inline: true },
                        { name: `🎭 Roles (${newRoles.length})`, value: newRoles.length > 0 ? newRoles.slice(0, 5).join(' ') + (newRoles.length > 5 ? ` +${newRoles.length - 5} more` : '') : 'No roles', inline: false }
                    )
                    .setColor(newSelectedMember.displayHexColor || '#3498db');
                    
                    await i.update({
                        content: shouldMention ? `${newSelectedMember}, you've been chosen!` : null,
                        embeds: [newEmbed],
                        components: [row],
                        allowedMentions: { users: shouldMention ? [newUser.id] : [] }
                    });
                    
                } catch (error) {
                    console.error('Button interaction error:', error);
                    await i.reply({
                        content: 'An error occurred while selecting another user.',
                        flags: ["Ephemeral"]
                    });
                }
            });
            
            collector.on('end', () => {
                const disabledRow = ActionRowBuilder.from(row).setComponents(
                    ButtonBuilder.from(row.components[0]).setDisabled(true)
                );
                
                interaction.editReply({ components: [disabledRow] }).catch(console.error);
            });
            
        } catch (error) {
            console.error('RandomUser command error:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Failed to select a random user. Please try again.')],
                flags: ["Ephemeral"]
            });
        }
    },
};



