import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';

// Migrated from: commands/Counter/counterlist.js
export default {
    data: new SlashCommandBuilder()
        .setName("counterlist")
        .setDescription("List all active server stats counters")
        .setDMPermission(false),
    category: "Counter",

    async execute(interaction, config, client) {
        await interaction.deferReply({ ephemeral: true });

        const { guild } = interaction;
        const counters = await getServerCounters(client, guild.id);

        if (counters.length === 0) {
            return interaction.editReply({
                embeds: [
                    createEmbed(
                        "No Counters",
                        BotConfig.counters.messages.noCounters ||
                            "There are no active counters in this server. Use `/countercreate` to create one.",
                        BotConfig.embeds.colors.info,
                    ),
                ],
            });
        }

        // Group counters by type for better organization
        const countersByType = {};

        for (const counter of counters) {
            const channel = guild.channels.cache.get(counter.channelId);
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

        // Format the counter list
        const counterSections = [];

        for (const [type, data] of Object.entries(countersByType)) {
            const channelsList = data.channels
                .map((c) => {
                    const channelMention = c.channel
                        ? c.channel.toString()
                        : "*Deleted Channel*";
                    let info = `• ${channelMention}`;

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
                    createEmbed(
                        "Active Counters",
                        currentSection,
                        BotConfig.embeds.colors.primary,
                    ),
                );
                currentSection = section;
            } else {
                currentSection += (currentSection ? "\n\n" : "") + section;
            }
        }

        // Add the last section
        if (currentSection) {
            embeds.push(
                createEmbed(
                    "Active Counters",
                    currentSection,
                    BotConfig.embeds.colors.primary,
                ),
            );
        }

        // Add a footer to the last embed
        if (embeds.length > 0) {
            embeds[embeds.length - 1].setFooter({
                text: `Total counters: ${counters.length}`,
                iconURL: interaction.guild.iconURL(),
            });
        }

        interaction.editReply({
            embeds: embeds,
            ephemeral: true,
        });
    },
};
