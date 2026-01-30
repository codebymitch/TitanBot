import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { BotConfig } from '../../config/bot.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../services/counterService.js';

// Migrated from: commands/Counter/countercreate.js
export default {
    data: new SlashCommandBuilder()
        .setName("countercreate")
        .setDescription("Create a new server stats counter")
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Type of counter to create")
                .setRequired(true)
                .addChoices(
                    { name: "All Members", value: "members" },
                    { name: "Bots Only", value: "bots" },
                    { name: "Humans Only", value: "members_only" },
                ),
        )
        .addStringOption((option) =>
            option
                .setName("channeltype")
                .setDescription("Type of channel to create for the counter")
                .setRequired(true)
                .addChoices(
                    { name: "Voice Channel", value: "voice" },
                    { name: "Text Channel", value: "text" },
                ),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),
    category: "ServerStats",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const type = interaction.options.getString("type");
        const channelType = interaction.options.getString("channeltype");
        const { guild } = interaction;

        // Get counter type configuration
        const counterType = BotConfig.counters.types[type];
        if (!counterType) {
            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: `Invalid counter type: ${type}. Please contact support if you believe this is an error.`, }),
                ],
            });
        }

        // Generate channel name from config
        const channelNameTemplate = BotConfig.counters?.defaults?.name || "📊 {type} Counter";
        console.log('Channel name template:', channelNameTemplate);
        console.log('Counter type:', counterType);
        console.log('Counter type name:', counterType.name);
        
        const channelName = channelNameTemplate.replace(
            "{type}",
            counterType.name,
        ).replace(
            "{name}",
            counterType.name,
        );
        
        console.log('Final channel name:', channelName);

        // Check permissions
        if (
            !guild.members.me.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: BotConfig.counters?.messages?.missingManageChannels || "I need the 'Manage Channels' permission to create counters." }),
                ],
            });
        }

        // Get existing counters
        const counters = await getServerCounters(client, guild.id);

        // Create the appropriate channel type
        let channel;
        try {
            // Build base channel options
            const channelOptions = {
                name: channelName,
                permissionOverwrites: [
                    // Deny specified permissions for everyone
                    {
                        id: guild.roles.everyone.id,
                        deny: (BotConfig.counters?.permissions?.deny || ['Connect', 'SendMessages'])
                            .map((perm) => PermissionFlagsBits[perm])
                            .filter((perm) => perm !== undefined),
                    },
                    // Allow specified permissions for the bot
                    {
                        id: client.user.id,
                        allow: (BotConfig.counters?.permissions?.allow || ['ViewChannel', 'ReadMessageHistory'])
                            .map((perm) => PermissionFlagsBits[perm])
                            .filter((perm) => perm !== undefined),
                    },
                ],
            };

            if (channelType === "voice") {
                channel = await guild.channels.create({
                    ...channelOptions,
                    type: ChannelType.GuildVoice,
                    // Additional voice channel specific permissions
                    permissionOverwrites: [
                        ...channelOptions.permissionOverwrites,
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.Connect],
                        },
                    ],
                });
            } else {
                channel = await guild.channels.create({
                    ...channelOptions,
                    type: ChannelType.GuildText,
                    // Additional text channel specific permissions
                    permissionOverwrites: [
                        ...channelOptions.permissionOverwrites,
                        {
                            id: guild.roles.everyone.id,
                            deny: [PermissionFlagsBits.SendMessages],
                        },
                    ],
                });
            }
        } catch (error) {
            console.error("Error creating channel:", error);
            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: `Failed to create ${channelType} channel: ${error.message}` }),
                ],
            });
        }

        // Create counter
        const counter = {
            id: Date.now().toString(),
            type,
            channelId: channel.id,
            channelType: channel.type,
            createdAt: new Date().toISOString(),
        };

        try {
            // Save the counter to the database
            counters.push({
                id: Date.now().toString(),
                type,
                channelId: channel.id,
                channelType: channel.type,
                guildId: guild.id,
                createdAt: new Date().toISOString(),
                createdBy: interaction.user.id,
            });

            const saved = await saveServerCounters(client, guild.id, counters);

            if (!saved) {
                throw new Error("Failed to save counter to database");
            }

            // Verify the counter was saved correctly
            console.log('Verifying counter was saved...');
            const verifyCounters = await getServerCounters(client, guild.id);
            console.log('Verification - retrieved counters after save:', verifyCounters);
            
            // Get the counter we just added (last one in the array)
            const lastAddedCounter = counters[counters.length - 1];
            console.log('Looking for counter with ID:', lastAddedCounter.id);
            
            const savedCounter = verifyCounters.find(c => c.id === lastAddedCounter.id);
            console.log('Found counter:', savedCounter);
            
            if (!savedCounter) {
                console.error('Counter was not found in database after save!');
                console.error('Expected counter ID:', lastAddedCounter.id);
                console.error('Available counter IDs:', verifyCounters.map(c => c.id));
                throw new Error("Counter verification failed - not found in database");
            }
            console.log('Counter verification successful!');

            // Update the counter display
            const newCounter = counters[counters.length - 1];
            console.log('Updating counter:', newCounter);
            console.log('Guild member count:', guild.memberCount);
            
            const updateSuccess = await updateCounter(client, guild, newCounter);
            console.log('Counter update success:', updateSuccess);

            // Format success message from config
            const messageTemplate = BotConfig.counters?.messages?.counterCreated || "✅ {type} counter created in {channel}!";
            const successMessage = messageTemplate
                .replace("{type}", counterType.name)
                .replace("{channel}", channel.toString());

            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "✅ Counter Created", description: successMessage }),
                ],
            });
        } catch (error) {
            console.error("Error saving counter:", error);

            // Clean up the channel if saving failed
            await channel.delete().catch(console.error);

            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "Error", description: `Failed to save counter: ${error.message}. The channel has been removed.` }),
                ],
            });
        }
    },
};

