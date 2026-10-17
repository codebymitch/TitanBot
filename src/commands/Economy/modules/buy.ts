import type { Command } from '../../../types/index.js';
import { SlashCommandBuilder, MessageFlags, type GuildMember } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed, infoEmbed, warningEmbed } from '../../../utils/embeds.js';
import { shopItems } from '../../../config/shop/items.js';
import { getEconomyData, setEconomyData } from '../../../utils/economy.js';
import { getGuildConfig } from '../../../services/config/guildConfig.js';
import { withErrorHandling, createError, ErrorTypes } from '../../../utils/errorHandler.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';

const SHOP_ITEMS = shopItems;

export default {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Kauf ein Item im Shop')
        .addStringOption(option =>
            option
                .setName('item_id')
                .setDescription('ID des Items, das du kaufen möchtest')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('quantity')
                .setDescription('Anzahl (Standard: 1)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),

    execute: withErrorHandling(async (interaction, config, client) => {
        const deferred = await InteractionHelper.safeDefer(interaction);
        if (!deferred) return;

            const userId = interaction.user.id;
            const guildId = interaction.guildId!;
            const itemId = interaction.options.getString("item_id")!.toLowerCase();
            const quantity = interaction.options.getInteger("quantity") || 1;

            const item = SHOP_ITEMS.find(i => i.id === itemId);

            if (!item) {
                throw createError(
                    `Item ${itemId} not found`,
                    ErrorTypes.VALIDATION,
                    `Die Item-ID \`${itemId}\` gibt es im Shop nicht.`,
                    { itemId }
                );
            }

            if (quantity < 1) {
                throw createError(
                    "Invalid quantity",
                    ErrorTypes.VALIDATION,
                    "Du musst mindestens 1 Stück kaufen.",
                    { quantity }
                );
            }

            const totalCost = item.price * quantity;

            const guildConfig = await getGuildConfig(client, guildId);
            const PREMIUM_ROLE_ID = guildConfig.premiumRoleId;

            const userData = await getEconomyData(client, guildId, userId);

            if (userData.wallet < totalCost) {
                throw createError(
                    "Insufficient funds",
                    ErrorTypes.VALIDATION,
                    `Du brauchst **$${totalCost.toLocaleString()}** für ${quantity}x **${item.name}**, hast aber nur **$${userData.wallet.toLocaleString()}** in deiner Geldbörse.`,
                    { required: totalCost, current: userData.wallet, itemId, quantity }
                );
            }

            if (item.type === "role" && itemId === "premium_role") {
                if (!PREMIUM_ROLE_ID) {
                    throw createError(
                        "Premium role not configured",
                        ErrorTypes.CONFIGURATION,
                        "Die **Premium-Shop-Rolle** wurde noch nicht von einem Server-Admin eingerichtet.",
                        { itemId }
                    );
                }
                if ((interaction.member as GuildMember).roles.cache.has(PREMIUM_ROLE_ID)) {
                    throw createError(
                        "Role already owned",
                        ErrorTypes.VALIDATION,
                        `Du hast die Rolle **${item.name}** bereits.`,
                        { itemId, roleId: PREMIUM_ROLE_ID }
                    );
                }
                if (quantity > 1) {
                    throw createError(
                        "Invalid quantity for role",
                        ErrorTypes.VALIDATION,
                        `Du kannst die Rolle **${item.name}** nur einmal kaufen.`,
                        { itemId, quantity }
                    );
                }
            }

            userData.wallet -= totalCost;

            let successDescription = `Du hast ${quantity}x **${item.name}** für **$${totalCost.toLocaleString()}** gekauft!`;

            if (item.type === "role" && itemId === "premium_role") {
                const member = interaction.member as GuildMember;

                const role = interaction.guild!.roles.cache.get(PREMIUM_ROLE_ID!);

                if (!role) {
                    throw createError(
                        "Role not found",
                        ErrorTypes.CONFIGURATION,
                        "Die eingerichtete Premium-Rolle existiert auf diesem Server nicht mehr.",
                        { roleId: PREMIUM_ROLE_ID }
                    );
                }

                try {
                    await member.roles.add(
                        role,
                        `Rolle gekauft: ${item.name}`,
                    );
                    successDescription += `\n\n**👑 Du hast die Rolle ${role.toString()} erhalten!**`;
                } catch (roleError) {
                    userData.wallet += totalCost;
                    await setEconomyData(client, guildId, userId, userData);
                    throw createError(
                        "Role assignment failed",
                        ErrorTypes.DISCORD_API,
                        "Das Geld wurde abgebucht, aber die Rolle konnte nicht vergeben werden. Du hast dein Geld zurückerhalten.",
                        { roleId: PREMIUM_ROLE_ID, originalError: roleError instanceof Error ? roleError.message : String(roleError) }
                    );
                }
            } else if (item.type === "upgrade") {
                userData.upgrades![itemId] = true;
                successDescription += `\n\n**✨ Dein Upgrade ist jetzt aktiv!**`;
            } else if (item.type === "consumable" || item.type === "tool") {
                userData.inventory[itemId] =
                    (userData.inventory[itemId] || 0) + quantity;
                if (item.type === "tool") {
                    successDescription += `\n\n**🛠️ ${item.name} wurde deinem Inventar hinzugefügt!**`;
                }
            }

            await setEconomyData(client, guildId, userId, userData);

            const embed = successEmbed(
                "💰 Kauf erfolgreich",
                successDescription,
            ).addFields({
                name: "Neuer Kontostand",
                value: `$${userData.wallet.toLocaleString()}`,
                inline: true,
            });

            await InteractionHelper.safeEditReply(interaction, { embeds: [embed], flags: [MessageFlags.Ephemeral] });
    }, { command: 'buy' })
} satisfies Command;
