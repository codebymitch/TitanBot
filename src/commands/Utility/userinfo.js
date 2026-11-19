import { SlashCommandBuilder } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

async function executeAvatar(interaction) {
    const user = interaction.options.getUser("target") || interaction.user;
    const avatarUrl = user.displayAvatarURL({ size: 2048, dynamic: true });

    const embed = createEmbed({
        title: `${user.username}'s Avatar`,
        description: `[Download Link](${avatarUrl})`
    })
        .setImage(avatarUrl);

    await InteractionHelper.safeReply(interaction, { embeds: [embed] });
    logger.info(`UserInfo avatar subcommand executed`, {
        userId: interaction.user.id,
        targetUserId: user.id,
        guildId: interaction.guildId
    });
}

async function executeInfo(interaction) {
    const deferSuccess = await InteractionHelper.safeDefer(interaction);
    if (!deferSuccess) {
        logger.warn(`UserInfo interaction defer failed`, {
            userId: interaction.user.id,
            guildId: interaction.guildId,
            commandName: 'userinfo'
        });
        return;
    }

    const user = interaction.options.getUser("target") || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const createdTimestamp = Math.floor(user.createdAt.getTime() / 1000);
    const joinedTimestamp = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : null;

    const embed = createEmbed({ title: `User Info: ${user.username}` })
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: "ID", value: user.id, inline: true },
            { name: "Bot", value: user.bot ? "Yes" : "No", inline: true },
            {
                name: "Roles",
                value:
                    member && member.roles.cache.size > 1
                        ? member.roles.cache
                            .map((r) => r.name)
                            .slice(0, 5)
                            .join(",")
                        : "None",
                inline: true,
            },
            {
                name: "Account Created",
                value: `<t:${createdTimestamp}:R>`,
                inline: false,
            },
            {
                name: "Joined Server",
                value: joinedTimestamp ? `<t:${joinedTimestamp}:R>` : "Not in server",
                inline: false,
            },
            {
                name: "Highest Role",
                value: member?.roles?.highest?.name || "None",
                inline: true,
            },
        );

    await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
    logger.info(`UserInfo command executed`, {
        userId: interaction.user.id,
        targetUserId: user.id,
        guildId: interaction.guildId
    });
}

export default {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Get detailed information about a user")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("info")
                .setDescription("Show detailed information about a user")
                .addUserOption((option) =>
                    option
                        .setName("target")
                        .setDescription("The user to inspect (defaults to you)"))
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("avatar")
                .setDescription("Display a user's avatar image")
                .addUserOption((option) =>
                    option
                        .setName("target")
                        .setDescription("The user whose avatar you want to see (defaults to you)"))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "avatar") {
            return executeAvatar(interaction);
        }

        return executeInfo(interaction);
    },
};
