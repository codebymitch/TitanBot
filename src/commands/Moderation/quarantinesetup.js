// src/commands/Moderation/setup-quarantine.js
import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-quarantine')
        .setDescription('Create and setup the Quarantine role'),
    
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You need Administrator permissions!', ephemeral: true });
        }

        const role = await interaction.guild.roles.create({
            name: 'Quarantine',
            color: '#000000',
            reason: 'Automated setup for Quarantine system'
        });

        interaction.guild.channels.cache.forEach(channel => {
            channel.permissionOverwrites.create(role, { ViewChannel: false }).catch(console.error);
        });

        await interaction.reply(`Quarantine role created and channels secured. Role ID: ${role.id}`);
    }
};
