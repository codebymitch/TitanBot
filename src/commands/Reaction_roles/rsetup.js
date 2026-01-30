import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Reaction_roles/rsetup.js
export default {
    data: new SlashCommandBuilder()
        .setName('rsetup')
        .setDescription('Set up a reaction role message')
        .addChannelOption(option => 
            option.setName('channel')
                .setDescription('The channel to send the reaction role message to')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title for the reaction role message')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Description for the reaction role message')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('role1')
                .setDescription('First role to add')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option.setName('role2')
                .setDescription('Second role to add')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role3')
                .setDescription('Third role to add')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role4')
                .setDescription('Fourth role to add')
                .setRequired(false)
        )
        .addRoleOption(option =>
            option.setName('role5')
                .setDescription('Fifth role to add')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: ["Ephemeral"] });

            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            
            // Get all provided roles
            const roles = [];
            for (let i = 1; i <= 5; i++) {
                const role = interaction.options.getRole(`role${i}`);
                if (role) {
                    // Check if the bot has permission to manage this role
                    if (role.position >= interaction.guild.members.me.roles.highest.position) {
                        return interaction.editReply({
                            embeds: [errorEmbed('Error', `I don't have permission to manage the role ${role.name}. Please move my role higher in the role hierarchy.`)]
                        });
                    }
                    roles.push(role);
                }
            }

            if (roles.length < 1) {
                return interaction.editReply({
                    embeds: [errorEmbed('Error', 'You must provide at least one role.')]
                });
            }

            // Create the select menu
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('reaction_roles')
                    .setPlaceholder('Select your roles')
                    .setMinValues(0)
                    .setMaxValues(roles.length)
                    .addOptions(
                        roles.map(role => ({
                            label: role.name,
                            description: `Add/remove the ${role.name} role`,
                            value: role.id,
                            emoji: '🎭' // You can customize this emoji
                        }))
                    )
            );

            // Send the message with the select menu
            const message = await channel.send({
                embeds: [{
                    title,
                    description,
                    color: 0x3498DB,
                    fields: [
                        {
                            name: 'Available Roles',
                            value: roles.map(role => `• ${role}`).join('\n')
                        }
                    ]
                }],
                components: [row]
            });

            // Prepare the reaction role data
            const reactionRoleData = {
                guildId: interaction.guildId,
                channelId: channel.id,
                messageId: message.id,
                roles: roles.map(role => role.id)
            };

            // Save the reaction role data to the database using consistent key format
            const key = `reaction_roles:${interaction.guildId}:${message.id}`;
            console.log(`[ReactionRole] Saving reaction role data for message ${message.id}:`, reactionRoleData);
            try {
                await interaction.client.db.set(key, reactionRoleData);
                console.log(`[ReactionRole] Successfully saved reaction role data for message ${message.id}`);
                
                // Verify the data was saved
                const savedData = await interaction.client.db.get(key);
                console.log(`[ReactionRole] Verified saved data for message ${message.id}:`, savedData);
                
                if (!savedData) {
                    throw new Error('Failed to verify saved reaction role data');
                }
            } catch (error) {
                console.error(`[ReactionRole] Error saving reaction role data:`, error);
                throw error; // This will be caught by the outer try-catch
            }

            await interaction.editReply({
                embeds: [successEmbed('Success', `Reaction role message created in ${channel}!`)]
            });

        } catch (error) {
            console.error('Error setting up reaction roles:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'An error occurred while setting up reaction roles.')]
            });
        }
    }
};
