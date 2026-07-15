import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
export const success = (title, description) => ({ embeds: [createEmbed({ title, description, color: 'success' })] });
export const info = (title, description) => ({ embeds: [createEmbed({ title, description, color: 'primary' })] });
export const error = description => ({ embeds: [createEmbed({ title: 'שגיאה', description, color: 'error' })], ephemeral: true });
export const verifyPanel = () => ({ embeds: [createEmbed({ title: 'אימות חברים', description: 'לחצו על הכפתור כדי לאמת את חשבונכם.', color: 'primary' })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify').setLabel('אימות').setStyle(ButtonStyle.Success))] });
export const ticketPanel = () => ({ embeds: [createEmbed({ title: 'פתיחת פנייה', description: 'זקוקים לעזרה? לחצו על הכפתור כדי לפתוח פנייה פרטית.', color: 'primary' })], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_open').setLabel('פתיחת פנייה').setStyle(ButtonStyle.Primary))] });
