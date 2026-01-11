import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { getPromoRow } from '../../utils/components.js';
import { getMonthName } from '../../utils/dateUtils.js';

const MONTH_CHOICES = [
    { name: "January", value: 1 },
    { name: "February", value: 2 },
    { name: "March", value: 3 },
    { name: "April", value: 4 },
    { name: "May", value: 5 },
    { name: "June", value: 6 },
    { name: "July", value: 7 },
    { name: "August", value: 8 },
    { name: "September", value: 9 },
    { name: "October", value: 10 },
    { name: "November", value: 11 },
    { name: "December", value: 12 },
];

const ITEMS_PER_PAGE = 15;

/**
 * Utility to determine the next and previous month indices (1-12) with wrap-around.
 * @param {number} current Current month index.
 * @returns {{next: number, prev: number}}
 */
function getMonthNeighbors(current) {
    return {
        next: (current % 12) + 1,
        prev: current === 1 ? 12 : current - 1,
    };
}

/**
 * Filters, sorts, paginates, and generates the embed/components for a specific month.
 * This is the core logic, now designed for both initial reply and button updates.
 *
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {number} targetMonth The month (1-12) to list.
 * @param {object} allBirthdays The full map of stored birthdays.
 * @returns {Promise<{embeds: EmbedBuilder[], components: ActionRowBuilder[], totalItems: number}>}
 */
async function generateListContent(client, guild, targetMonth, allBirthdays) {
    // 1. Filter User IDs by the target month
    let userIds = Object.keys(allBirthdays).filter(
        (userId) => allBirthdays[userId].month === targetMonth,
    );

    // 2. Sort User IDs by day
    userIds.sort((aId, bId) => {
        return allBirthdays[aId].day - allBirthdays[bId].day;
    });

    // Handle case where no birthdays are found for the month
    if (userIds.length === 0) {
        const monthName = getMonthName(targetMonth);
        const embed = new EmbedBuilder()
            .setTitle(`🎂 Birthdays in ${monthName}`)
            .setDescription(`No birthdays registered for ${monthName}.`)
            .setColor("#F1C40F");

        const neighbors = getMonthNeighbors(targetMonth);

        // Create Navigation Buttons (for month cycling only)
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`prev_month:${neighbors.prev}`)
                .setLabel(`⬅️ ${getMonthName(neighbors.prev)}`)
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`next_month:${neighbors.next}`)
                .setLabel(`${getMonthName(neighbors.next)} ➡️`)
                .setStyle(ButtonStyle.Primary),
        );

        return { embeds: [embed], components: [row], totalItems: 0 };
    }

    // 3. Fetch members (Using safe logic to prevent timeouts on large lists)
    let members = guild.members.cache;
    if (userIds.length <= 100) {
        try {
            members = await guild.members.fetch({
                user: userIds,
                force: false,
            });
        } catch (e) {
            console.warn(
                `[BirthdayList] Failed to bulk fetch members: ${e.message}. Falling back to cache.`,
            );
        }
    }

    // 4. Map sorted IDs to formatted strings (only first page)
    const formattedList = userIds.map((userId) => {
        const bday = allBirthdays[userId];
        const member = members.get(userId);
        const name = member ? member.displayName : `(User ID: ${userId})`;
        return `• **${bday.day}**: ${name}`;
    });

    // 5. Build Embed
    const monthName = getMonthName(targetMonth);
    const description = formattedList.slice(0, ITEMS_PER_PAGE).join("\n");
    const totalPages = Math.ceil(formattedList.length / ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setTitle(`🎂 Birthdays in ${monthName}`)
        .setDescription(description)
        .setColor("#F1C40F")
        .setFooter({
            text:
                totalPages > 1
                    ? `Showing 1 of ${totalPages} pages. (${formattedList.length} total entries)`
                    : `Total entries: ${formattedList.length}`,
        });

    // 6. Build Month Navigation Buttons
    const neighbors = getMonthNeighbors(targetMonth);
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            // Custom ID format: action:month_index (e.g., "prev_month:12")
            .setCustomId(`prev_month:${neighbors.prev}`)
            .setLabel(`⬅️ ${getMonthName(neighbors.prev)}`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`next_month:${neighbors.next}`)
            .setLabel(`${getMonthName(neighbors.next)} ➡️`)
            .setStyle(ButtonStyle.Primary),
    );

    return {
        embeds: [embed],
        components: [row],
        totalItems: formattedList.length,
    };
}

// --- Main Command Definition ---
// Migrated from: commands/Birthday/birthdaylist.js
export default {
    data: new SlashCommandBuilder()
        .setName("birthdaylist")
        .setDescription(
            "Lists all registered birthdays in the server, month by month.",
        )
        .addIntegerOption((option) =>
            option
                .setName("month")
                .setDescription("Select the starting month for the list.")
                // CRITICAL CHANGE: Set to required
                .setRequired(true)
                .addChoices(...MONTH_CHOICES),
        ),

    // Command Execution
    async execute(interaction, guildConfig, client) {
        if (!interaction.inGuild()) {
            return interaction.reply({
                embeds: [
                    errorEmbed(
                        "Guild Command Only",
                        "This command can only be used inside a server.",
                    ),
                ],
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const guild = interaction.guild;
        const initialMonth = interaction.options.getInteger("month");

        try {
            const allBirthdays = await getGuildBirthdays(client, guild.id);

            // Initial content generation
            let { embeds, components } = await generateListContent(
                client,
                guild,
                initialMonth,
                allBirthdays,
            );

            // Send initial reply
            const replyMessage = await interaction.editReply({
                embeds,
                components,
                fetchReply: true,
            });

            // --- Button Collector ---
            const collector = replyMessage.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: 120000, // 2 minutes to interact
            });

            collector.on("collect", async (i) => {
                // Ensure the button is a month navigator
                if (!i.customId.includes("_month")) {
                    return i.reply({
                        content: "Unknown action.",
                        ephemeral: true,
                    });
                }

                // Custom ID is "action:month_index"
                const newMonth = parseInt(i.customId.split(":")[1], 10);

                // Regenerate content for the new month
                const { embeds: newEmbeds, components: newComponents } =
                    await generateListContent(
                        client,
                        guild,
                        newMonth,
                        allBirthdays,
                    );

                await i.update({
                    embeds: newEmbeds,
                    components: newComponents,
                });
            });

            // Disable buttons when the collector times out
            collector.on("end", async () => {
                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("disabled_prev")
                        .setLabel("⬅️ Previous")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId("disabled_next")
                        .setLabel("Next ➡️")
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                );

                await interaction
                    .editReply({ components: [disabledRow] })
                    .catch(() => {});
            });
        } catch (error) {
            console.error(
                `Error listing birthdays for guild ${guild.id}:`,
                error,
            );
            await interaction.editReply({
                embeds: [
                    errorEmbed(
                        "Error Listing",
                        "There was an issue fetching or processing the birthday data.",
                    ),
                ],
            });
        }
    },
};
