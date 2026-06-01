import { SlashCommandBuilder, PermissionsBitField, Colors } from 'discord.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-quarantine')
        .setDescription('Create and setup the Quarantine role'),
    
    async execute(interaction) {
        // Only allow administrators to run this
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You need Administrator permissions!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Get bot's highest role position
            const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
            const botTopRolePosition = botMember.roles.highest.position;

            // Create the role
            const role = await interaction.guild.roles.create({
                name: 'Quarantine',
                color: Colors.Red,
                reason: 'Automated setup for Quarantine system',
                position: botTopRolePosition - 2 // Place it 2 positions below the bot's top role
            });

            // Iterate through channels and deny viewing permissions
            const channels = interaction.guild.channels.cache;
            for (const [channelId, channel] of channels) {
                // Skip category channels if you want, or just apply to all
                if (channel.permissionOverwrites) {
                    await channel.permissionOverwrites.create(role, { 
                        ViewChannel: false 
                    }).catch(err => logger.warn(`Failed to update permissions for ${channel.name}: ${err.message}`));
                }
            }

            await interaction.editReply(`Quarantine role created (Red) and channels secured. Role ID: ${role.id}`);
        } catch (error) {
            logger.error('Quarantine setup error:', error);
            await interaction.editReply('An error occurred while setting up the quarantine system.');
        }
    }
};
