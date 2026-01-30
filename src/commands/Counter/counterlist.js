import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getServerCounters, saveServerCounters } from '../../services/counterService.js';
import { BotConfig } from '../../config/bot.js';

// Migrated from: commands/Counter/counterlist.js
export default {
    data: new SlashCommandBuilder()
        .setName("counterlist")
        .setDescription("List all active server stats counters")
        .setDMPermission(false),
    category: "Counter",

    async execute(interaction, config, client) {
        await interaction.deferReply();

        const { guild } = interaction;
        const counters = await getServerCounters(client, guild.id);
        
        console.log('Retrieved counters:', counters);
        console.log('Number of counters:', counters.length);

        if (counters.length === 0) {
            return interaction.editReply({
                embeds: [
                    createEmbed({ title: "No Counters", description: BotConfig.counters.messages.noCounters ||
                            "There are no active counters in this server. Use `/countercreate` to create one." }),
                ],
            });
        }

        // Group counters by type for better organization
        const countersByType = {};

        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
            
            // Skip counters for deleted channels and mark for cleanup
            if (!channel) {
                console.warn(`Skipping counter ${counter.id} - channel ${counter.channelId} not found`);
                continue;
            }
            
            const counterType = BotConfig.counters.types[counter.type] || {
                name: counter.type,
                description: `Counts ${counter.type.replace("_", " ")}`,
            };

            if (!countersByType[counter.type]) {
                countersByType[counter.type] = {
                    name: counterType.name,
                    description: counterType.description,
                    channels: [],
                };
            }

            countersByType[counter.type].channels.push({
                id: counter.id,
                channel: channel,
                createdAt: counter.createdAt
                    ? new Date(counter.createdAt)
                    : null,
                createdBy: counter.createdBy,
            });
        }

        // Clean up orphaned counters (counters for deleted channels)
        const validCounters = counters.filter(counter => guild.channels.cache.has(counter.channelId));
        if (validCounters.length !== counters.length) {
            console.log(`Cleaning up ${counters.length - validCounters.length} orphaned counters`);
            await saveServerCounters(client, guild.id, validCounters);
        }

        // Format the counter list
        const counterSections = [];

        for (const [type, data] of Object.entries(countersByType)) {
            const channelsList = data.channels
                .map((c) => {
                    const channelMention = c.channel
                        ? c.channel.toString()
                        : "*Deleted Channel*";
                    let info = `• **ID:** \`${c.id}\` - ${channelMention}`;

                    if (c.createdAt) {
                        info += ` (Created: <t:${Math.floor(c.createdAt.getTime() / 1000)}:R>)`;
                    }

                    if (c.createdBy) {
                        info += ` by <@${c.createdBy}>`;
                    }

                    return info;
                })
                .join("\n");

            counterSections.push(`**${data.name}**\n${channelsList}`);
        }

        // If there are too many counters, split into multiple embeds
        const maxLength = 2000; // Discord embed description limit
        let currentSection = "";
        const embeds = [];

        for (const section of counterSections) {
            if (currentSection.length + section.length + 2 > maxLength) {
                embeds.push(
                    createEmbed({ title: "Active Counters", description: currentSection }),
                );
                currentSection = section;
            } else {
                currentSection += (currentSection ? "\n\n" : "") + section;
            }
        }

        // Add the last section
        if (currentSection) {
            embeds.push(
                createEmbed({ title: "Active Counters", description: currentSection }),
            );
        }

        // Add a footer to the last embed
        if (embeds.length > 0) {
            embeds[embeds.length - 1].setFooter({
                text: `Total counters: ${counters.length}`,
                iconURL: interaction.guild.iconURL(),
            });
        }

        // Handle case where all counters were invalid
        if (embeds.length === 0) {
            return interaction.editReply({
                embeds: [
                    createEmbed({ 
                        title: "No Valid Counters", 
                        description: "No valid counters found. There may be corrupted data in the database." 
                    })
                ]
            });
        }

        interaction.editReply({
            embeds: embeds,
        });
    },
};
