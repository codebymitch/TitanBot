import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
    LabelBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    EmbedBuilder,
    type ChatInputCommandInteraction,
    type Guild,
    type StringSelectMenuInteraction,
    type SelectMenuModalData,
} from 'discord.js';
import { getColor, BotConfig, isBotOwner } from '../../../config/bot.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, ErrorTypes, replyUserError } from '../../../utils/errorHandler.js';
import { getEconomyPrefix } from '../../../utils/database.js';
import { getEconomyData, addMoney, removeMoney, getMaxBankCapacity } from '../../../utils/economy.js';
import type { EconomyData } from '../../../utils/economy.js';
import type { Command, NexoClient, SubcommandModule } from '../../../types/index.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildDashboardEmbed(guild: Guild, client: NexoClient) {
    const currencySymbol = BotConfig.economy.currency.symbol;
    const currencyName = BotConfig.economy.currency.name;

    let totalInCirculation = 0;
    let userCount = 0;

    try {
        const economyKeys = await client.db.list(getEconomyPrefix(guild.id));

        if (economyKeys && economyKeys.length > 0) {
            for (const key of economyKeys) {
                const userId = key.split(':').pop();

                const member = await guild.members.fetch(userId!).catch(() => null);
                if (member?.user?.bot) continue;

                const userData = await client.db.get<Partial<EconomyData>>(key, {});
                if (userData) {
                    totalInCirculation += (userData.wallet || 0) + (userData.bank || 0);
                    userCount++;
                }
            }
        }
    } catch (error) {
        logger.error('Error calculating economy stats:', error);
    }

    const avgBalance = userCount > 0 ? Math.floor(totalInCirculation / userCount) : 0;

    return new EmbedBuilder()
        .setTitle('💰 Wirtschafts-Dashboard')
        .setDescription(`Verwalte das Wirtschaftssystem von **${guild.name}**.\nWähle unten eine Option aus.`)
        .setColor(getColor('economy'))
        .addFields(
            { name: '💰 Gesamt im Umlauf', value: `\`${currencySymbol}${totalInCirculation.toLocaleString()}\``, inline: true },
            { name: '👥 Aktive Nutzer', value: `\`${userCount.toLocaleString()}\``, inline: true },
            { name: '📊 Durchschnittlicher Kontostand', value: `\`${currencySymbol}${avgBalance.toLocaleString()}\``, inline: true },
            { name: '💱 Währungssymbol', value: `\`${currencySymbol}\``, inline: true },
            { name: '📝 Währungsname', value: `\`${currencyName}\``, inline: true },
        )
        .setFooter({ text: 'Das Dashboard schließt sich nach 10 Minuten Inaktivität' })
        .setTimestamp();
}

function buildSelectMenu(guildId: string) {
    return new StringSelectMenuBuilder()
        .setCustomId(`economy_dashboard_${guildId}`)
        .setPlaceholder('Wähle eine Aktion...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Währung hinzufügen')
                .setDescription('Füge der Geldbörse oder Bank eines Nutzers Währung hinzu')
                .setValue('add_currency')
                .setEmoji('💰'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Währung entfernen')
                .setDescription('Entferne Währung aus der Geldbörse oder Bank eines Nutzers')
                .setValue('remove_currency')
                .setEmoji('💸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Währungssymbol ändern')
                .setDescription('Ändere das Währungssymbol (z. B. $, €, £)')
                .setValue('change_currency')
                .setEmoji('💱'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Währungsname ändern')
                .setDescription('Ändere den Namen der Währung (z. B. Münzen, Credits)')
                .setValue('change_name')
                .setEmoji('📝'),
        );
}

async function refreshDashboard(rootInteraction: ChatInputCommandInteraction, guild: Guild, client: NexoClient) {
    const selectMenu = buildSelectMenu(guild.id);
    await InteractionHelper.safeEditReply(rootInteraction, {
        embeds: [await buildDashboardEmbed(guild, client)],
        components: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu),
        ],
    }).catch(() => {});
}

/**
 * Quoted literal for a value written into the bot config source, or null when the value could break
 * the file or the regexes below (quotes, backslashes, line breaks).
 */
export function toConfigLiteral(value: string): string | null {
    return /["\\\r\n]/.test(value) ? null : JSON.stringify(value);
}

async function updateConfigFile(currencySymbol: string, currencyName: string) {
    const symbolLiteral = toConfigLiteral(currencySymbol);
    const nameLiteral = toConfigLiteral(currencyName);
    if (!symbolLiteral || !nameLiteral) {
        return false;
    }

    try {
        // tsx dev runs from src/ (config/bot.ts); the compiled build runs from dist/ (config/bot.js).
        const tsConfigPath = path.join(__dirname, '../../../config/bot.ts');
        const configPath = await fs.access(tsConfigPath).then(() => tsConfigPath, () => path.join(__dirname, '../../../config/bot.js'));
        let configContent = await fs.readFile(configPath, 'utf-8');

        configContent = configContent.replace(
            /symbol:\s*"[^"]*"/,
            `symbol: ${symbolLiteral}`
        );

        configContent = configContent.replace(
            /(\/\/\s*Currency display name\.?\s*\n\s*)name:\s*"[^"]*"/,
            (_match: string, prefix: string) => `${prefix}name: ${nameLiteral}`
        );

        configContent = configContent.replace(
            /(\/\/\s*Plural display name\.?\s*\n\s*)namePlural:\s*"[^"]*"/,
            (_match: string, prefix: string) => `${prefix}namePlural: ${nameLiteral}`
        );
        
        await fs.writeFile(configPath, configContent, 'utf-8');
        logger.info('Config file updated successfully');
        return true;
    } catch (error) {
        logger.error('Error updating config file:', error);
        return false;
    }
}

export default {
    prefixOnly: false,
    async execute(interaction, config, client) {
        try {
            const guild = interaction.guild!;
            const selectMenu = buildSelectMenu(guild.id);
            const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [await buildDashboardEmbed(guild, client)],
                components: [selectRow],
            });

            const collector = interaction.channel!.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId === `economy_dashboard_${guild.id}`,
                time: 600_000,
            });

            collector.on('collect', async selectInteraction => {
                const selectedOption = selectInteraction.values[0];
                try {
                    switch (selectedOption) {
                        case 'add_currency':
                            await handleAddCurrency(selectInteraction, interaction, guild, client);
                            break;
                        case 'remove_currency':
                            await handleRemoveCurrency(selectInteraction, interaction, guild, client);
                            break;
                        case 'change_currency':
                            await handleChangeCurrency(selectInteraction, interaction, guild);
                            break;
                        case 'change_name':
                            await handleChangeName(selectInteraction, interaction, guild);
                            break;
                    }
                } catch (error) {
                    if (error instanceof NexoBotError) {
                        logger.debug(`Economy dashboard validation error: ${error.message}`);
                    } else {
                        logger.error('Unexpected economy dashboard error:', error);
                    }

                    const errorMessage =
                        error instanceof NexoBotError
                            ? error.userMessage || 'Beim Verarbeiten deiner Auswahl ist ein Fehler aufgetreten.'
                            : 'Beim Verarbeiten deiner Anfrage ist ein unerwarteter Fehler aufgetreten.';

                    if (!selectInteraction.replied && !selectInteraction.deferred) {
                        await selectInteraction.deferUpdate().catch(() => {});
                    }

                    await replyUserError(selectInteraction, {
                        type: ErrorTypes.UNKNOWN,
                        message: errorMessage,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('Dashboard abgelaufen')
                        .setDescription('Dieses Dashboard wurde wegen Inaktivität geschlossen. Führe den Command erneut aus, um weiterzumachen.')
                        .setColor(getColor('error'));
                    
                    await InteractionHelper.safeEditReply(interaction, {
                        embeds: [timeoutEmbed],
                        components: [],
                    }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in economy_dashboard:', error);
            throw new NexoBotError(
                `Economy dashboard failed: ${error instanceof Error ? error.message : String(error)}`,
                ErrorTypes.UNKNOWN,
                'Das Wirtschafts-Dashboard konnte nicht geöffnet werden.',
            );
        }
    },
} satisfies SubcommandModule & Pick<Command, 'prefixOnly'>;

async function handleAddCurrency(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guild: Guild, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`economy_add_currency_${guild.id}`)
        .setTitle('Währung hinzufügen');

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('target_user')
        .setPlaceholder('Wähle einen Nutzer...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const userLabel = new LabelBuilder()
        .setLabel('Ziel-Nutzer')
        .setDescription('Nutzer, dem Währung hinzugefügt wird')
        .setUserSelectMenuComponent(userSelect);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Betrag zum Hinzufügen')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('100')
        .setMinLength(1)
        .setMaxLength(10)
        .setRequired(true);

    const typeInput = new TextInputBuilder()
        .setCustomId('type')
        .setLabel('Typ (wallet = Geldbörse, bank = Bank)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('wallet')
        .setMinLength(1)
        .setMaxLength(5)
        .setRequired(true);

    modal.addLabelComponents(userLabel);
    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `economy_add_currency_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const userId = (submitted.fields.getField('target_user') as SelectMenuModalData).values[0];
    const amount = parseInt(submitted.fields.getTextInputValue('amount').trim(), 10);
    const type = submitted.fields.getTextInputValue('type').trim().toLowerCase();

    if (isNaN(amount) || amount <= 0) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Der Betrag muss eine positive Zahl sein.' });
        return;
    }

    if (type !== 'wallet' && type !== 'bank') {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Der Typ muss entweder „wallet“ oder „bank“ sein.' });
        return;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'Der angegebene Nutzer ist nicht auf diesem Server.' });
        return;
    }

    if (member.user.bot) {
        await replyUserError(submitted, { type: ErrorTypes.UNKNOWN, message: 'Bots haben kein Wirtschaftskonto.' });
        return;
    }

    const { newBalance } = await addMoney(client, guild.id, userId, amount, type);

    const currencySymbol = BotConfig.economy.currency.symbol;

    await submitted.reply({
        embeds: [successEmbed('Währung hinzugefügt', `${currencySymbol}${amount.toLocaleString()} wurden ${type === 'wallet' ? 'der Geldbörse' : 'der Bank'} von ${member.user.tag} hinzugefügt.\n**Neuer Kontostand:** ${currencySymbol}${newBalance.toLocaleString()}`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.info(`[ECONOMY_DASHBOARD] Currency added`, {
        adminId: submitted.user.id,
        targetUserId: userId,
        amount,
        type,
        newBalance,
    });

    await refreshDashboard(rootInteraction, guild, client);
}

async function handleRemoveCurrency(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guild: Guild, client: NexoClient) {
    const modal = new ModalBuilder()
        .setCustomId(`economy_remove_currency_${guild.id}`)
        .setTitle('Währung entfernen');

    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('target_user')
        .setPlaceholder('Wähle einen Nutzer...')
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true);

    const userLabel = new LabelBuilder()
        .setLabel('Ziel-Nutzer')
        .setDescription('Nutzer, dem Währung entfernt wird')
        .setUserSelectMenuComponent(userSelect);

    const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Betrag zum Entfernen')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('100')
        .setMinLength(1)
        .setMaxLength(10)
        .setRequired(true);

    const typeInput = new TextInputBuilder()
        .setCustomId('type')
        .setLabel('Typ (wallet = Geldbörse, bank = Bank)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('wallet')
        .setMinLength(1)
        .setMaxLength(5)
        .setRequired(true);

    modal.addLabelComponents(userLabel);
    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(typeInput),
    );

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `economy_remove_currency_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const userId = (submitted.fields.getField('target_user') as SelectMenuModalData).values[0];
    const amount = parseInt(submitted.fields.getTextInputValue('amount').trim(), 10);
    const type = submitted.fields.getTextInputValue('type').trim().toLowerCase();

    if (isNaN(amount) || amount <= 0) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Der Betrag muss eine positive Zahl sein.' });
        return;
    }

    if (type !== 'wallet' && type !== 'bank') {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Der Typ muss entweder „wallet“ oder „bank“ sein.' });
        return;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
        await replyUserError(submitted, { type: ErrorTypes.USER_INPUT, message: 'Der angegebene Nutzer ist nicht auf diesem Server.' });
        return;
    }

    if (member.user.bot) {
        await replyUserError(submitted, { type: ErrorTypes.UNKNOWN, message: 'Bots haben kein Wirtschaftskonto.' });
        return;
    }

    const { newBalance } = await removeMoney(client, guild.id, userId, amount, type);

    const currencySymbol = BotConfig.economy.currency.symbol;

    await submitted.reply({
        embeds: [successEmbed('Währung entfernt', `${currencySymbol}${amount.toLocaleString()} wurden aus ${type === 'wallet' ? 'der Geldbörse' : 'der Bank'} von ${member.user.tag} entfernt.\n**Neuer Kontostand:** ${currencySymbol}${newBalance.toLocaleString()}`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.info(`[ECONOMY_DASHBOARD] Currency removed`, {
        adminId: submitted.user.id,
        targetUserId: userId,
        amount,
        type,
        newBalance,
    });

    await refreshDashboard(rootInteraction, guild, client);
}

async function handleChangeCurrency(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guild: Guild) {
    // The currency lives in the global bot config file, so only bot owners may change it (not every guild's admins).
    if (!isBotOwner(selectInteraction.user.id)) {
        await replyUserError(selectInteraction, { type: ErrorTypes.PERMISSION, message: 'Die Währung gilt für alle Server. Nur Bot-Besitzer können sie ändern.' });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`economy_change_currency_${guild.id}`)
        .setTitle('Währungssymbol ändern');

    const symbolInput = new TextInputBuilder()
        .setCustomId('currency_symbol')
        .setLabel('Neues Währungssymbol')
        .setStyle(TextInputStyle.Short)
        .setValue(BotConfig.economy.currency.symbol)
        .setPlaceholder('$')
        .setMinLength(1)
        .setMaxLength(3)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(symbolInput));

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `economy_change_currency_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newSymbol = submitted.fields.getTextInputValue('currency_symbol').trim();

    if (newSymbol.length === 0 || newSymbol.length > 3 || !toConfigLiteral(newSymbol)) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Das Währungssymbol muss 1–3 Zeichen lang sein und darf keine Anführungszeichen oder Backslashes enthalten.' });
        return;
    }

    const success = await updateConfigFile(newSymbol, BotConfig.economy.currency.name);

    if (!success) {
        await replyUserError(submitted, { type: ErrorTypes.UNKNOWN, message: 'Die Konfigurationsdatei konnte nicht aktualisiert werden. Bitte prüf die Logs.' });
        return;
    }

    await submitted.reply({
        embeds: [successEmbed('Währungssymbol aktualisiert', `Das Währungssymbol ist jetzt **${newSymbol}**.\n\n**Hinweis:** Der Bot muss neu gestartet werden, damit die Änderung wirksam wird.`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.info(`[ECONOMY_DASHBOARD] Currency symbol changed`, {
        adminId: submitted.user.id,
        oldSymbol: BotConfig.economy.currency.symbol,
        newSymbol
    });
}

async function handleChangeName(selectInteraction: StringSelectMenuInteraction, rootInteraction: ChatInputCommandInteraction, guild: Guild) {
    // The currency lives in the global bot config file, so only bot owners may change it (not every guild's admins).
    if (!isBotOwner(selectInteraction.user.id)) {
        await replyUserError(selectInteraction, { type: ErrorTypes.PERMISSION, message: 'Die Währung gilt für alle Server. Nur Bot-Besitzer können sie ändern.' });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`economy_change_name_${guild.id}`)
        .setTitle('Währungsname ändern');

    const nameInput = new TextInputBuilder()
        .setCustomId('currency_name')
        .setLabel('Neuer Währungsname')
        .setStyle(TextInputStyle.Short)
        .setValue(BotConfig.economy.currency.name)
        .setPlaceholder('Münzen')
        .setMinLength(1)
        .setMaxLength(20)
        .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput));

    await selectInteraction.showModal(modal);

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === `economy_change_name_${guild.id}` && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const newName = submitted.fields.getTextInputValue('currency_name').trim();

    if (newName.length === 0 || newName.length > 20 || !toConfigLiteral(newName)) {
        await replyUserError(submitted, { type: ErrorTypes.VALIDATION, message: 'Der Währungsname muss 1–20 Zeichen lang sein und darf keine Anführungszeichen oder Backslashes enthalten.' });
        return;
    }

    const success = await updateConfigFile(BotConfig.economy.currency.symbol, newName);

    if (!success) {
        await replyUserError(submitted, { type: ErrorTypes.UNKNOWN, message: 'Die Konfigurationsdatei konnte nicht aktualisiert werden. Bitte prüf die Logs.' });
        return;
    }

    await submitted.reply({
        embeds: [successEmbed('Währungsname aktualisiert', `Der Währungsname ist jetzt **${newName}**.\n\n**Hinweis:** Der Bot muss neu gestartet werden, damit die Änderung wirksam wird.`)],
        flags: MessageFlags.Ephemeral,
    });

    logger.info(`[ECONOMY_DASHBOARD] Currency name changed`, {
        adminId: submitted.user.id,
        oldName: BotConfig.economy.currency.name,
        newName
    });
}