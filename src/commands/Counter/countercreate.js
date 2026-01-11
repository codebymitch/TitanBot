import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

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
        await interaction.deferReply({ ephemeral: true });

        const type = interaction.options.getString("type");
        const channelType = interaction.options.getString("channeltype");
        const { guild } = interaction;

        // Get counter type configuration
        const counterType = BotConfig.counters.types[type];
        if (!counterType) {
            return interaction.editReply({
                embeds: [
                    createEmbed(
                        "Error",
                        `Invalid counter type: ${type}. Please contact support if you believe this is an error.`,
                    ),
                ],
            });
        }

        // Generate channel name from config
        const channelName = BotConfig.counters.defaults.name.replace(
            "{type}",
            counterType.name,
        );

        // Check permissions
        if (
            !guild.members.me.permissions.has(
                PermissionFlagsBits.ManageChannels,
            )
        ) {
            return interaction.editReply({
                embeds: [
                    createEmbed(
                        "Error",
                        BotConfig.counters.messages.missingManageChannels,
                    ),
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
                        deny: BotConfig.counters.permissions.deny
                            .map((perm) => PermissionFlagsBits[perm])
                            .filter((perm) => perm !== undefined),
                    },
                    // Allow specified permissions for the bot
                    {
                        id: client.user.id,
                        allow: BotConfig.counters.permissions.allow
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
                    createEmbed(
                        "Error",
                        `Failed to create ${channelType} channel: ${error.message}`,
                        BotConfig.embeds.colors.error,
                    ),
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

            // Update the counter display
            await updateCounter(client, guild, counters[counters.length - 1]);

            // Format success message from config
            const successMessage = BotConfig.counters.messages.counterCreated
                .replace("{type}", counterType.name)
                .replace("{channel}", channel.toString());

            return interaction.editReply({
                embeds: [
                    createEmbed(
                        "✅ Counter Created",
                        successMessage,
                        BotConfig.embeds.colors.success,
                    ),
                ],
            });
        } catch (error) {
            console.error("Error saving counter:", error);

            // Clean up the channel if saving failed
            await channel.delete().catch(console.error);

            return interaction.editReply({
                embeds: [
                    createEmbed(
                        "Error",
                        `Failed to save counter: ${error.message}. The channel has been removed.`,
                        BotConfig.embeds.colors.error,
                    ),
                ],
            });
        }
    },
};

