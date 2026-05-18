import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const guildMMRoles = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('staff')
        .setDescription('🛡️ Gerenciar quais cargos podem assumir intermediações')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add-role')
                .setDescription('Adicionar um cargo à lista de staff de MM')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('O cargo que pode assumir intermediações')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-role')
                .setDescription('Remover um cargo da lista de staff de MM')
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('O cargo a remover')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Listar todos os cargos com permissão de MM')
        ),

    async execute(interaction) {
        const guildId = interaction.guildId;
        const subcommand = interaction.options.getSubcommand();
        const role = interaction.options.getRole('role');

        if (!guildId) {
            return interaction.reply({
                content: '❌ Este comando só pode ser usado em servidores.',
                ephemeral: true
            });
        }

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

        return interaction.reply({
            content: '❌ Subcomando desconhecido.',
            ephemeral: true
        });
    },
};
