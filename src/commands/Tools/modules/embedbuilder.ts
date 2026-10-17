import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    RadioGroupBuilder,
    type ButtonInteraction,
    type ChatInputCommandInteraction,
    type EmbedAuthorOptions,
    type EmbedFooterOptions,
    type Guild,
    type NewsChannel,
    type TextChannel,
} from 'discord.js';
import { InteractionHelper } from '../../../utils/interactionHelper.js';
import { successEmbed } from '../../../utils/embeds.js';
import { logger } from '../../../utils/logger.js';
import { NexoBotError, replyUserError, ErrorTypes } from '../../../utils/errorHandler.js';
import { getColor } from '../../../config/bot.js';
import type { Command } from '../../../types/index.js';

interface EmbedAuthorState {
    name: string;
    iconUrl: string | null;
    url: string | null;
}

interface EmbedFooterState {
    text: string;
    iconUrl: string | null;
}

interface EmbedFieldState {
    name: string;
    value: string;
    inline: boolean;
}

interface EmbedBuilderState {
    title: string | null;
    description: string | null;
    color: string | number | null;
    author: EmbedAuthorState | null;
    footer: EmbedFooterState | null;
    thumbnail: string | null;
    image: string | null;
    timestamp: boolean;
    fields: EmbedFieldState[];
}

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000; 

const COLOR_PRESETS = [
    { label: 'Primär (Blau)',         value: '#336699', emoji: '' },
    { label: 'Erfolg (Grün)',         value: '#57F287', emoji: '' },
    { label: 'Fehler (Rot)',          value: '#ED4245', emoji: '' },
    { label: 'Warnung (Gelb)',        value: '#FEE75C', emoji: '' },
    { label: 'Info (Hellblau)',       value: '#3498DB', emoji: '' },
    { label: 'Blurple (Discord)',     value: '#5865F2', emoji: '' },
    { label: 'Fuchsia',              value: '#EB459E', emoji: '' },
    { label: 'Gold',                  value: '#F1C40F', emoji: '' },
    { label: 'Weiß',                  value: '#FFFFFF', emoji: '' },
    { label: 'Dunkel',                value: '#202225', emoji: '' },
    { label: 'Eigener Hex-Wert …',    value: '__custom__', emoji: '' },
];

function isValidUrl(str: string) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidHex(str: string) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

function resolveEmbedColor(value: string | number | null) {
    try {
        const resolved = getColor(value || 'primary');
        if (typeof resolved === 'number' && Number.isFinite(resolved) && resolved >= 0 && resolved <= 0xffffff) {
            return resolved;
        }
    } catch {
        // ignore invalid value and fall through to primary
    }
    return getColor('primary');
}

function buildPreviewEmbed(state: EmbedBuilderState) {
    const embed = new EmbedBuilder();

    if (state.title)       embed.setTitle(state.title.substring(0, 256));
    if (state.description) embed.setDescription(state.description.substring(0, 4096));

    embed.setColor(resolveEmbedColor(state.color));

    if (state.author?.name) {
        const obj: EmbedAuthorOptions = { name: state.author.name.substring(0, 256) };
        if (state.author.iconUrl && isValidUrl(state.author.iconUrl)) obj.iconURL = state.author.iconUrl;
        if (state.author.url   && isValidUrl(state.author.url))      obj.url     = state.author.url;
        embed.setAuthor(obj);
    }

    if (state.footer?.text) {
        const obj: EmbedFooterOptions = { text: state.footer.text.substring(0, 2048) };
        if (state.footer.iconUrl && isValidUrl(state.footer.iconUrl)) obj.iconURL = state.footer.iconUrl;
        embed.setFooter(obj);
    }

    if (state.thumbnail && isValidUrl(state.thumbnail)) embed.setThumbnail(state.thumbnail);
    if (state.image     && isValidUrl(state.image))     embed.setImage(state.image);
    if (state.timestamp) embed.setTimestamp();

    if (state.fields.length > 0) embed.addFields(state.fields.slice(0, 25));

    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription('*(Leer – nutze das Menü unten, um Inhalte hinzuzufügen)*');
    }

    return embed;
}

function buildDashboardEmbed(state: EmbedBuilderState) {
    const trunc = (str: string, n: number) =>
        str.length > n ? str.substring(0, n) + '…' : str;

    const lines = [
        `**Titel** › ${state.title ?`\`${trunc(state.title, 40)}\`` : '`Nicht gesetzt`'}`,
        `**Beschreibung** › ${state.description ?`${state.description.length} Zeichen`: '`Nicht gesetzt`'}`,
        `**Farbe** › ${state.color ?`\`${state.color}\`` : '`Standard`'}`,
        `**Autor** › ${state.author?.name ?`\`${trunc(state.author.name, 30)}\`` : '`Nicht gesetzt`'}`,
        `**Footer** › ${state.footer?.text ?`\`${trunc(state.footer.text, 30)}\`` : '`Nicht gesetzt`'}`,
        `**Vorschaubild** › ${state.thumbnail ? '✅ Gesetzt' : '`Nicht gesetzt`'}`,
        `**Bild** › ${state.image ? '✅ Gesetzt' : '`Nicht gesetzt`'}`,
        `**Zeitstempel** › ${state.timestamp ? '✅ Aktiviert' : '`Deaktiviert`'}`,
        `**Felder** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('Embed-Builder – Steuerung')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({ text: 'Die Vorschau oben aktualisiert sich live · Schließt nach 15 Min. Inaktivität' });
}

function buildMainMenu(state: EmbedBuilderState) {
    const primaryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_edit_content')
            .setLabel('Inhalt bearbeiten')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId('eb_main_set_color')
            .setLabel('Farbe festlegen')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎨'),
        new ButtonBuilder()
            .setCustomId('eb_main_set_images')
            .setLabel('Bilder festlegen')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🖼️'),
        new ButtonBuilder()
            .setCustomId('eb_main_post_embed')
            .setLabel('Embed posten')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤'),
    );

    const secondaryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_add_field')
            .setLabel(`Feld hinzufügen (${state.fields.length}/${MAX_FIELDS})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),
        new ButtonBuilder()
            .setCustomId('eb_main_edit_field')
            .setLabel('Feld bearbeiten')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
            .setDisabled(state.fields.length === 0),
        new ButtonBuilder()
            .setCustomId('eb_main_remove_field')
            .setLabel('Feld entfernen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('➖')
            .setDisabled(state.fields.length === 0),
        new ButtonBuilder()
            .setCustomId('eb_main_toggle_timestamp')
            .setLabel(state.timestamp ? 'Zeitstempel ausschalten' : 'Zeitstempel einschalten')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕐'),
    );

    const tertiaryRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_reorder_fields')
            .setLabel('Felder sortieren')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('↕️')
            .setDisabled(state.fields.length < 2),
        new ButtonBuilder()
            .setCustomId('eb_main_json_export')
            .setLabel('JSON / Rohdaten')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId('eb_main_reset_all')
            .setLabel('Alles zurücksetzen')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    return [primaryRow, secondaryRow, tertiaryRow];
}

async function refreshDashboard(interaction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildPreviewEmbed(state), buildDashboardEmbed(state)],
        components: buildMainMenu(state),
    });
}

async function handleEditContent(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('Inhalt bearbeiten')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('Titel (max. 256 Zeichen)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Mein Embed-Titel'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('Beschreibung (max. 4000 Zeichen)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.description ? state.description.substring(0, 4000) : '')
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder('Schreib hier die Beschreibung deines Embeds …'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_content' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    await submitted.deferUpdate().catch(() => {});

    state.title       = submitted.fields.getTextInputValue('eb_title').trim()       || null;
    state.description = submitted.fields.getTextInputValue('eb_description').trim() || null;

    await refreshDashboard(rootInteraction, state);
}

async function handleSetColor(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    await selectInteraction.deferUpdate().catch(() => {});

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_color_pick')
        .setPlaceholder('Wähle eine Farbe …')
        .addOptions(
            COLOR_PRESETS.map(c =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.value)
                    .setEmoji(c.emoji)
                    .setDescription(c.value !== '__custom__' ? c.value : 'Gib deinen eigenen #RRGGBB-Wert ein'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Farbe festlegen')
                .setDescription(
                    'Wähle eine vordefinierte Farbe oder **Eigener Hex-Wert**, um einen eigenen `#RRGGBB`-Wert einzugeben.',
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(colorSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const colorCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_color_pick',
        time: 60_000,
        max: 1,
    });

    colorCollector.on('collect', async colorInter => {
        try {
        const picked = colorInter.values[0];

        if (picked === '__custom__') {
            const hexModal = new ModalBuilder()
                .setCustomId('eb_custom_hex')
                .setTitle('Eigene Farbe')
                .addComponents(
                    new ActionRowBuilder<TextInputBuilder>().addComponents(
                        new TextInputBuilder()
                            .setCustomId('hex_value')
                            .setLabel('Hex-Farbcode')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('#5865F2')
                            .setMaxLength(7)
                            .setMinLength(7)
                            .setRequired(true),
                    ),
                );

            const shown = await InteractionHelper.safeShowModal(colorInter, hexModal);
            if (!shown) return;

            const hexSubmit = await colorInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_custom_hex' && i.user.id === colorInter.user.id,
                    time: 60_000,
                })
                .catch(() => null);

            if (!hexSubmit) return;

            const hex = hexSubmit.fields.getTextInputValue('hex_value').trim();
            if (!isValidHex(hex)) {
                await replyUserError(hexSubmit, {
                    type: ErrorTypes.USER_INPUT,
                    message: `\`${hex}\` ist keine gültige Hex-Farbe. Nutze das Format \`#RRGGBB\` (z. B. \`#5865F2\`).`,
                });
                return;
            }

            state.color = hex;
            await hexSubmit.deferUpdate().catch(() => {});
        } else {
            state.color = picked;
            await colorInter.deferUpdate().catch(() => {});
        }

        await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('Embed builder color picker interaction failed:', error instanceof Error ? error.message : String(error));
        }
    });
}

async function handleSetAuthor(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('Autor festlegen')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Autorname (leer lassen zum Entfernen)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.name || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Dein Name'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('Autor-Icon-URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('Autor-Link-URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.url || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_author' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name    = submitted.fields.getTextInputValue('author_name').trim();
    const iconUrl = submitted.fields.getTextInputValue('author_icon').trim();
    const url     = submitted.fields.getTextInputValue('author_url').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'Die Autor-Icon-URL muss eine gültige `https://`-URL sein.',
        });
        return;
    }
    if (url && !isValidUrl(url)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'Die Autor-Link-URL muss eine gültige `https://`-URL sein.',
        });
        return;
    }

    state.author = name ? { name, iconUrl: iconUrl || null, url: url || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetFooter(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('Footer festlegen')
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Footer-Text (leer lassen zum Entfernen)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.text || '')
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder('Erstellt mit Nexo'),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('Footer-Icon-URL (optional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_footer' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const text    = submitted.fields.getTextInputValue('footer_text').trim();
    const iconUrl = submitted.fields.getTextInputValue('footer_icon').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'Die Footer-Icon-URL muss eine gültige `https://`-URL sein.',
        });
        return;
    }

    state.footer = text ? { text, iconUrl: iconUrl || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetImages(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    await selectInteraction.deferUpdate().catch(() => {});

    const imageSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_image_pick')
        .setPlaceholder('Was möchtest du ändern?')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Vorschaubild setzen')
                .setDescription('Kleines Bild oben rechts')
                .setValue('set_thumbnail')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Großes Bild setzen')
                .setDescription('Banner in voller Breite unten')
                .setValue('set_image')
                .setEmoji('📸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Vorschaubild entfernen')
                .setDescription('Aktuelles Vorschaubild entfernen')
                .setValue('clear_thumbnail')
                .setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Großes Bild entfernen')
                .setDescription('Aktuelles großes Bild entfernen')
                .setValue('clear_image')
                .setEmoji('🗑️'),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Bilder festlegen')
                .setDescription('Wähle, welches Bild du setzen oder entfernen willst.')
                .addFields(
                    { name: 'Vorschaubild', value: state.thumbnail ? `[Ansehen](${state.thumbnail})` : '`Nicht gesetzt`', inline: true },
                    { name: 'Großes Bild',  value: state.image     ? `[Ansehen](${state.image})`     : '`Nicht gesetzt`', inline: true },
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(imageSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const imgMenuCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_image_pick',
        time: 60_000,
        max: 1,
    });

    imgMenuCollector.on('collect', async imgInter => {
        try {
        const pick = imgInter.values[0];

        if (pick === 'clear_thumbnail') {
            state.thumbnail = null;
            await imgInter.deferUpdate();
            await refreshDashboard(rootInteraction, state);
            return;
        }
        if (pick === 'clear_image') {
            state.image = null;
            await imgInter.deferUpdate();
            await refreshDashboard(rootInteraction, state);
            return;
        }

        const isThumb = pick === 'set_thumbnail';

        const urlModal = new ModalBuilder()
            .setCustomId('eb_image_url')
            .setTitle(isThumb ? 'Vorschaubild setzen' : 'Großes Bild setzen')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('image_url')
                        .setLabel('Bild-URL')
                        .setStyle(TextInputStyle.Short)
                        .setValue(isThumb ? (state.thumbnail || '') : (state.image || ''))
                        .setRequired(true)
                        .setPlaceholder('https://example.com/image.png'),
                ),
            );

        const shown = await InteractionHelper.safeShowModal(imgInter, urlModal);
        if (!shown) return;

        const submitted = await imgInter
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'eb_image_url' && i.user.id === imgInter.user.id,
                time: 60_000,
            })
            .catch(() => null);

        if (!submitted) return;

        const url = submitted.fields.getTextInputValue('image_url').trim();
        if (!isValidUrl(url)) {
            await replyUserError(submitted, {
                type: ErrorTypes.USER_INPUT,
                message: 'Die Bild-URL muss ein gültiger `https://`-Link zu einem öffentlich erreichbaren Bild sein.',
            });
            return;
        }

        if (isThumb) state.thumbnail = url;
        else         state.image     = url;

        await submitted.deferUpdate().catch(() => {});
        await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('Embed builder image picker interaction failed:', error instanceof Error ? error.message : String(error));
        }
    });
}

async function handleAddField(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    if (state.fields.length >= MAX_FIELDS) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.VALIDATION,
            message: `Embeds können maximal ${MAX_FIELDS} Felder haben.`,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('Feld hinzufügen');

    const fieldNameLabel = new LabelBuilder()
        .setLabel('Feldname (max. 256 Zeichen)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setPlaceholder('Feldtitel'),
        );

    const fieldValueLabel = new LabelBuilder()
        .setLabel('Feldinhalt (max. 1024 Zeichen)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_value')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                .setRequired(true)
                .setPlaceholder('Hier kommt der Feldinhalt hin …'),
        );

    const inlineRadio = new RadioGroupBuilder()
        .setCustomId('field_inline')
        .setRequired(false)
        .addOptions([
            { label: 'Nein – volle Breite', value: 'no' },
            { label: 'Ja – nebeneinander', value: 'yes' },
        ]);

    const inlineLabel = new LabelBuilder()
        .setLabel('Inline anzeigen?')
        .setRadioGroupComponent(inlineRadio);

    modal.addLabelComponents(fieldNameLabel, fieldValueLabel, inlineLabel);

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_add_field' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name     = submitted.fields.getTextInputValue('field_name').trim();
    const value    = submitted.fields.getTextInputValue('field_value').trim();
    const inline   = submitted.fields.getRadioGroup('field_inline') === 'yes';

    state.fields.push({ name, value, inline });

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleEditField(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_edit_field_pick')
        .setPlaceholder('Wähle ein Feld zum Bearbeiten …')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 80)}${f.value.length > 80 ? '…' : ''} · ${f.inline ? 'Nebeneinander' : 'Volle Breite'}`,
                    )
                    .setValue(String(i))
                    .setEmoji('📝'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Feld bearbeiten')
                .setDescription('Wähle das Feld, das du ändern willst.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_edit_field_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        try {
        const idx   = parseInt(pickInter.values[0], 10);
        const field = state.fields[idx];
        if (!field) { await pickInter.deferUpdate(); return; }

        const modal = new ModalBuilder()
            .setCustomId('eb_edit_field_modal')
            .setTitle(`Feld ${idx + 1} bearbeiten`);

        const editNameLabel = new LabelBuilder()
            .setLabel('Feldname')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_name')
                    .setStyle(TextInputStyle.Short)
                    .setValue(field.name)
                    .setMaxLength(256)
                    .setRequired(true),
            );

        const editValueLabel = new LabelBuilder()
            .setLabel('Feldinhalt')
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId('field_value')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(field.value.substring(0, 4000))
                    .setMaxLength(1024)
                    .setRequired(true),
            );

        const editInlineRadio = new RadioGroupBuilder()
            .setCustomId('field_inline')
            .setRequired(false)
            .addOptions([
                { label: 'Nein – volle Breite', value: 'no' },
                { label: 'Ja – nebeneinander', value: 'yes' },
            ]);
        
        if (field.inline) {
            editInlineRadio.setOptions([
                { label: 'Nein – volle Breite', value: 'no' },
                { label: 'Ja – nebeneinander', value: 'yes', default: true },
            ]);
        }

        const editInlineLabel = new LabelBuilder()
            .setLabel('Inline anzeigen?')
            .setRadioGroupComponent(editInlineRadio);

        modal.addLabelComponents(editNameLabel, editValueLabel, editInlineLabel);

        const shown = await InteractionHelper.safeShowModal(pickInter, modal);
        if (!shown) return;

        const submitted = await pickInter
            .awaitModalSubmit({
                filter: i =>
                    i.customId === 'eb_edit_field_modal' && i.user.id === pickInter.user.id,
                time: 120_000,
            })
            .catch(() => null);

        if (!submitted) return;

        const name   = submitted.fields.getTextInputValue('field_name').trim();
        const value  = submitted.fields.getTextInputValue('field_value').trim();
        const inline = submitted.fields.getRadioGroup('field_inline') === 'yes';

        state.fields[idx] = { name, value, inline };

        await submitted.deferUpdate().catch(() => {});
        await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('Embed builder field edit interaction failed:', error instanceof Error ? error.message : String(error));
        }
    });
}

async function handleRemoveField(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('Wähle ein Feld zum Entfernen …')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('➖'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Feld entfernen')
                .setDescription('Wähle das Feld, das du löschen willst.')
                .setColor(getColor('warning')),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInter => {
        await removeInter.deferUpdate();
        const idx = parseInt(removeInter.values[0], 10);
        state.fields.splice(idx, 1);
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleReorderFields(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_reorder_pick')
        .setPlaceholder('Wähle ein Feld zum Verschieben …')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('↕️'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Felder sortieren')
                .setDescription('Wähle ein Feld und verschiebe es dann mit den Pfeilen nach oben oder unten.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_reorder_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        await pickInter.deferUpdate();
        const sourceIdx = parseInt(pickInter.values[0], 10);

        const upBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_up')
            .setLabel('Nach oben')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬆️')
            .setDisabled(sourceIdx === 0);

        const downBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_down')
            .setLabel('Nach unten')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬇️')
            .setDisabled(sourceIdx === state.fields.length - 1);

        const cancelBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_cancel')
            .setLabel('Abbrechen')
            .setStyle(ButtonStyle.Secondary);

        await pickInter.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Feld verschieben')
                    .setDescription(
                        `Verschiebe **${state.fields[sourceIdx].name}** – aktuell an Position **${sourceIdx + 1}** von **${state.fields.length}**.`,
                    )
                    .setColor(getColor('info')),
            ],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(upBtn, downBtn, cancelBtn)],
            flags: MessageFlags.Ephemeral,
        });

        const dirCollector = rootInteraction.channel!.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === selectInteraction.user.id &&
                ['eb_reorder_up', 'eb_reorder_down', 'eb_reorder_cancel'].includes(i.customId),
            time: 30_000,
            max: 1,
        });

        dirCollector.on('collect', async dirInter => {
            await dirInter.deferUpdate();
            if (dirInter.customId === 'eb_reorder_cancel') return;

            const targetIdx =
                dirInter.customId === 'eb_reorder_up' ? sourceIdx - 1 : sourceIdx + 1;

            if (targetIdx < 0 || targetIdx >= state.fields.length) return;

            const temp             = state.fields[sourceIdx];
            state.fields[sourceIdx] = state.fields[targetIdx];
            state.fields[targetIdx] = temp;

            await refreshDashboard(rootInteraction, state);
        });
    });
}

async function handlePostEmbed(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState, guild: Guild) {
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.VALIDATION,
            message: 'Füge vor dem Posten mindestens einen Titel, eine Beschreibung oder ein Feld hinzu.',
        });
        return;
    }

    await selectInteraction.deferUpdate();

    const chanSelect = new ChannelSelectMenuBuilder()
        .setCustomId('eb_post_channel')
        .setPlaceholder('Wähle einen Kanal …')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Embed posten')
                .setDescription('Wähle den Kanal, in den das Embed gesendet werden soll.')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chanSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel!.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_post_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInter => {
        await chanInter.deferUpdate();
        const channel = chanInter.channels.first() as TextChannel | NewsChannel | undefined;

        if (!channel) {
            await replyUserError(chanInter, {
                type: ErrorTypes.USER_INPUT,
                message: 'Der ausgewählte Kanal konnte nicht gefunden werden.',
            });
            return;
        }

        const perms = channel.permissionsFor(guild.members.me!);
        if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            await replyUserError(chanInter, {
                type: ErrorTypes.PERMISSION,
                message: `Ich brauche in ${channel} die Berechtigungen **Nachrichten senden** und **Links einbetten**, um dort zu posten.`,
            });
            return;
        }

        const finalEmbed = buildPreviewEmbed(state);

        if (finalEmbed.data.description === '*(Leer – nutze das Menü unten, um Inhalte hinzuzufügen)*') {
            finalEmbed.setDescription(null);
        }

        await channel.send({ embeds: [finalEmbed] });

        await chanInter.followUp({
            embeds: [successEmbed('Embed gesendet', `Dein Embed wurde in ${channel} gepostet.`)],
            flags: MessageFlags.Ephemeral,
        });
    });
}

async function handleJsonExport(selectInteraction: ButtonInteraction, rootInteraction: ChatInputCommandInteraction, state: EmbedBuilderState) {
    await selectInteraction.deferUpdate();

    const previewEmbed = buildPreviewEmbed(state);
    const json = JSON.stringify(previewEmbed.toJSON(), null, 2);

    if (json.length <= 3980) {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription(`\`\`\`json\n${json}\n\`\`\``)
                    .setColor(getColor('info')),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } else {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription('Das JSON ist zu lang für die Anzeige – sieh dir die angehängte Datei an.')
                    .setColor(getColor('info')),
            ],
            files: [
                {
                    attachment: Buffer.from(json, 'utf-8'),
                    name: 'embed.json',
                },
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription('Erstelle und poste ein komplett eigenes Embed mit Live-Vorschau')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferSuccess) return;

            const guild = interaction.guild!;

            const state: EmbedBuilderState = {
                title:       null,
                description: null,
                color:       getColor('primary'),
                author:      null,
                footer:      null,
                thumbnail:   null,
                image:       null,
                timestamp:   false,
                fields:      [],
            };

            await refreshDashboard(interaction, state);

            const collector = interaction.channel!.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId.startsWith('eb_main_'),
                time: IDLE_TIMEOUT,
            });

            collector.on('collect', async ci => {
                try {
                    switch (ci.customId) {
                        case 'eb_main_edit_content':
                            await handleEditContent(ci, interaction, state);
                            break;
                        case 'eb_main_set_color':
                            await handleSetColor(ci, interaction, state);
                            break;
                        case 'eb_main_set_images':
                            await handleSetImages(ci, interaction, state);
                            break;
                        case 'eb_main_post_embed':
                            await handlePostEmbed(ci, interaction, state, guild);
                            break;
                        case 'eb_main_add_field':
                            await handleAddField(ci, interaction, state);
                            break;
                        case 'eb_main_edit_field':
                            await handleEditField(ci, interaction, state);
                            break;
                        case 'eb_main_remove_field':
                            await handleRemoveField(ci, interaction, state);
                            break;
                        case 'eb_main_reorder_fields':
                            await handleReorderFields(ci, interaction, state);
                            break;
                        case 'eb_main_toggle_timestamp':
                            state.timestamp = !state.timestamp;
                            await ci.deferUpdate();
                            await refreshDashboard(interaction, state);
                            break;
                        case 'eb_main_json_export':
                            await handleJsonExport(ci, interaction, state);
                            break;
                        case 'eb_main_reset_all':
                            state.title       = null;
                            state.description = null;
                            state.color       = getColor('primary');
                            state.author      = null;
                            state.footer      = null;
                            state.thumbnail   = null;
                            state.image       = null;
                            state.timestamp   = false;
                            state.fields      = [];
                            await ci.deferUpdate();
                            await refreshDashboard(interaction, state);
                            break;
                        default:
                            await ci.deferUpdate();
                    }
                } catch (error) {
                    logger.error('Error in embedbuilder collector:', error);
                    const msg =
                        error instanceof NexoBotError
                            ? error.userMessage || 'Ein Fehler ist aufgetreten.'
                            : 'Ein unerwarteter Fehler ist aufgetreten.';
                    if (!ci.replied && !ci.deferred) await ci.deferUpdate().catch(() => {});
                    await replyUserError(ci, {
                        type: ErrorTypes.UNKNOWN,
                        message: msg,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await InteractionHelper.safeEditReply(interaction, { components: [] }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof NexoBotError) throw error;
            logger.error('Unexpected error in embedbuilder:', error);
            throw new NexoBotError(
                `embedbuilder failed: ${error instanceof Error ? error.message : String(error)}`,
                ErrorTypes.UNKNOWN,
                'Der Embed-Builder konnte nicht geöffnet werden.',
            );
        }
    },
} satisfies Command;