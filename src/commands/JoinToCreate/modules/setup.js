import { ChannelType, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { addJoinToCreateTrigger, getJoinToCreateConfig } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
        const category = interaction.options.getChannel('category');
        const nameTemplate = interaction.options.getString('channel_name') || "{username}'s Room";
        const userLimit = interaction.options.getInteger('user_limit') || 0;
        const bitrate = interaction.options.getInteger('bitrate') || 64;
        const guildId = interaction.guild.id;

        try {
            // Create the trigger channel with a static name
            const triggerChannel = await interaction.guild.channels.create({
                name: 'Join to Create',
                type: ChannelType.GuildVoice,
                parent: category?.id,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                ],
            });

            // Add to database with the template for temporary channels
            await addJoinToCreateTrigger(client, guildId, triggerChannel.id, {
                nameTemplate: nameTemplate,
                userLimit: userLimit,
                bitrate: bitrate * 1000,
                categoryId: category?.id
            });

            const embed = successEmbed(
                `Created trigger channel: ${triggerChannel}\n\n` +
                `**Settings:**\n` +
                `• Temporary Channel Name Template: \`${nameTemplate}\`\n` +
                `• User Limit: ${userLimit === 0 ? 'No limit' : userLimit + ' users'}\n` +
                `• Bitrate: ${bitrate} kbps\n` +
                `${category ? `• Category: ${category.name}` : '• Category: None (root level)'}\n\n` +
                `When users join this channel, a temporary voice channel will be created for them.`,
                '✅ Join to Create Setup Complete'
            );

            // Try to respond to the interaction, handling any state issues
            try {
                // If already deferred, use editReply
                if (interaction.deferred) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    // Otherwise use reply
                    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            } catch (responseError) {
                console.error('Error responding to interaction:', responseError);
                
                // Last resort fallback
                try {
                    if (!interaction.replied) {
                        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                    }
                } catch (e) {
                    // At this point we've tried everything
                    console.error('All response attempts failed:', e);
                }
            }
        } catch (error) {
            console.error('Error in JoinToCreate setup:', error);
            throw new Error(`Failed to set up Join to Create: ${error.message}`);
        }
    }
};
