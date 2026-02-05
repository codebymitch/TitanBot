import { SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../../utils/embeds.js';
import { BotConfig } from '../../../config/bot.js';
import { getServerCounters, saveServerCounters, updateCounter } from '../../../services/counterService.js';
