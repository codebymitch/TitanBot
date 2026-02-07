import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { getGuildBirthdays, getMonthName } from '../../../utils/database.js';

export default {
    async execute(interaction, config, client) {
try {
            const guildId = interaction.guildId;
            const birthdays = await getGuildBirthdays(client, guildId);

            if (!birthdays || Object.keys(birthdays).length === 0) {
                return interaction.reply({
                    embeds: [errorEmbed("No Birthdays", "No birthdays have been set in this server yet.")]
                });
            }

            const embed = createEmbed("🎂 Server Birthdays", `Found ${Object.keys(birthdays).length} birthdays in ${interaction.guild.name}`);

            const sortedBirthdays = Object.entries(birthdays)
                .map(([userId, data]) => ({
                    userId,
                    month: data.month,
                    day: data.day,
                    monthName: getMonthName(data.month)
                }))
                .sort((a, b) => {
                    if (a.month !== b.month) return a.month - b.month;
                    return a.day - b.day;
                });

            let birthdayList = "";
            sortedBirthdays.forEach((birthday, index) => {
                const member = interaction.guild.members.cache.get(birthday.userId);
                const userName = member ? member.user.username : `User ${birthday.userId}`;
                birthdayList += `${index + 1}. **${userName}** - ${birthday.monthName} ${birthday.day}\n`;
            });

            embed.setDescription(birthdayList || "No birthdays found");
            embed.setFooter({ text: `Total: ${sortedBirthdays.length} birthdays` });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("Birthday list command error:", error);
            await interaction.editReply({
                embeds: [errorEmbed("Error", "Failed to fetch birthday list.")]
            });
        }
    }
};
