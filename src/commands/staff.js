/**
 * Staff Management Command
 * 
 * Allows server administrators to configure which roles can claim and close
 * middleman tickets. By default, users with role name "Suporte" can claim.
 * 
 * Usage:
 *   /staff add-role <role> - Add a role that can claim MM tickets
 *   /staff remove-role <role> - Remove a role from MM staff list
 *   /staff list - List all roles with MM permissions
 */

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isUserStaff } from '../handlers/mmHumanoHandler.js';

// Store per-guild MM staff roles (in production, store in database)
const guildMMRoles = new Map();

export const data = new SlashCommandBuilder()
  .setName('staff')
  .setDescription('🛡️ Gerenciar quais cargos podem assumir intermediações')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('add-role')
      .setDescription('Adicionar um cargo à lista de staff de MM')
      .addRoleOption(opt =>
        opt
          .setName('role')
          .setDescription('O cargo que pode assumir intermediações')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('remove-role')
      .setDescription('Remover um cargo da lista de staff de MM')
      .addRoleOption(opt =>
        opt
          .setName('role')
          .setDescription('O cargo a remover')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('Listar todos os cargos com permissão de MM')
  );

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const subcommand = interaction.options.getSubcommand();
  const role = interaction.options.getRole('role');

  // Initialize guild MM roles if not exist
  if (!guildMMRoles.has(guildId)) {
    guildMMRoles.set(guildId, new Set());
  }

  const mmRoles = guildMMRoles.get(guildId);

  if (subcommand === 'add-role') {
    if (mmRoles.has(role.id)) {
      return interaction.reply({
        content: `⚠️ O cargo ${role.toString()} já tem permissão de MM.`,
        ephemeral: true
      });
    }

    mmRoles.add(role.id);
    return interaction.reply({
      content: `✅ Cargo ${role.toString()} adicionado com sucesso!\n\n👥 Usuários com este cargo agora podem assumir intermediações.`,
      ephemeral: true
    });
  }

  if (subcommand === 'remove-role') {
    if (!mmRoles.has(role.id)) {
      return interaction.reply({
        content: `⚠️ O cargo ${role.toString()} não está na lista de staff de MM.`,
        ephemeral: true
      });
    }

    mmRoles.delete(role.id);
    return interaction.reply({
      content: `✅ Cargo ${role.toString()} removido com sucesso!`,
      ephemeral: true
    });
  }

  if (subcommand === 'list') {
    const supportRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'suporte');
    
    let list = '**Cargos com Permissão de MM:**\n\n';
    
    if (supportRole) {
      list += `🔸 ${supportRole.toString()} (padrão - nome "Suporte")\n`;
    } else {
      list += '🔸 Nenhum cargo padrão com nome "Suporte" encontrado\n';
    }

    if (mmRoles.size > 0) {
      list += '\n**Cargos Adicionados:**\n';
      for (const roleId of mmRoles) {
        const r = interaction.guild.roles.cache.get(roleId);
        if (r) {
          list += `🔹 ${r.toString()}\n`;
        }
      }
    } else {
      list += '\n*Nenhum cargo adicional configurado*';
    }

    list += '\n\n**Para adicionar um cargo:**\n`/staff add-role <cargo>`\n\n**Para remover:**\n`/staff remove-role <cargo>`';

    return interaction.reply({
      content: list,
      ephemeral: true
    });
  }
}

export default { data, execute };
