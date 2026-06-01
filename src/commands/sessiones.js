import { ApplicationCommandOptionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

if (!global.mapaVotos) {
    global.mapaVotos = new Map();
}

const command = {
    name: 'sesiones_00y4n',
    description: 'Gestión de sesiones de Roleplay y Car Meets',
    options: [
        {
            name: 'startup_rp',
            description: 'Lanza un inicio de sesión de Roleplay convencional.',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: 'reacciones', description: 'Cantidad de reacciones necesarias.', type: ApplicationCommandOptionType.Integer, required: true },
                { name: 'limite', description: 'Ejemplo: 80 MPH', type: ApplicationCommandOptionType.String, required: false },
                { name: 'peacetime', description: '¿Peacetime activo? (On / Off)', type: ApplicationCommandOptionType.String, required: false },
                { name: 'imagen', description: 'Link de la foto/banner para el Roleplay (opcional).', type: ApplicationCommandOptionType.String, required: false }
            ]
        },
        {
            name: 'startup_meet',
            description: 'Lanza un inicio de sesión para un Car Meet.',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: 'reacciones', description: 'Cantidad de reacciones necesarias.', type: ApplicationCommandOptionType.Integer, required: true },
                { name: 'tematica', description: 'Ejemplo: JDM, Exóticos', type: ApplicationCommandOptionType.String, required: true },
                { name: 'spots', description: 'Ejemplo: 2-3 SPOTS + BOTM', type: ApplicationCommandOptionType.String, required: true },
                { name: 'ubicacion', description: 'Lugar de inicio (Ej: Spawn)', type: ApplicationCommandOptionType.String, required: true },
                { name: 'imagen', description: 'Link de la foto/banner para el Car Meet (opcional).', type: ApplicationCommandOptionType.String, required: false }
            ]
        },
        {
            name: 'release',
            description: 'Lanza el botón del link vinculándolo al inicio.',
            type: ApplicationCommandOptionType.Subcommand,
            options: [
                { name: 'id_inicio', description: 'Copia el ID del mensaje de Startup.', type: ApplicationCommandOptionType.String, required: true },
                { name: 'tipo', description: '¿RP o Meet?', type: ApplicationCommandOptionType.String, required: true, choices: [{ name: 'Roleplay', value: 'rp' }, { name: 'Car Meet', value: 'meet' }] },
                { name: 'imagen', description: 'Link de la foto/banner para la apertura (opcional).', type: ApplicationCommandOptionType.String, required: false }
            ]
        }
    ],

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const urlImagen = interaction.options.getString('imagen');

        if (sub === 'startup_rp') {
            const reacciones = interaction.options.getInteger('reacciones');
            const limite = interaction.options.getString('limite') || '80 MPH';
            const peacetime = interaction.options.getString('peacetime') || 'Off';

            const embedRP = new EmbedBuilder()
                .setTitle('__SWFL RP Startup__')
                .setDescription(`> **Anfitrión:** <@${interaction.user.id}>\n\n*Asegúrate de haber leído las normativas en el canal correspondiente y tener tu vehículo registrado antes de ingresar a la sesión.*\n\n**¡Necesitamos ${reacciones} reacciones para iniciar!**`)
                .addFields(
                    { name: '› Límite de Velocidad (FRP)', value: `${limite}`, inline: true },
                    { name: '› Estado de Peacetime', value: `${peacetime}`, inline: true }
                )
                .setColor('#1E90FF');

            if (urlImagen) embedRP.setImage(urlImagen);

            await interaction.reply({ content: 'Lanzando Startup...', ephemeral: true });
            const msg = await interaction.channel.send({ content: '@everyone', embeds: [embedRP] });
            await msg.react('✅');

            global.mapaVotos.set(msg.id, new Set());
        }

        if (sub === 'startup_meet') {
            const reacciones = interaction.options.getInteger('reacciones');
            const tematica = interaction.options.getString('tematica');
            const spots = interaction.options.getString('spots');
            const ubicacion = interaction.options.getString('ubicacion');

            const embedMeet = new EmbedBuilder()
                .setTitle('__SWFL Meet Startup__')
                .setDescription(`> **Anfitrión:** <@${interaction.user.id}>\n\n*¡Atención amantes de los fierros! Se viene una juntada oficial.*\n\n**¡Necesitamos ${reacciones} reacciones para iniciar!**`)
                .addFields(
                    { name: '❗ Temática del Meet', value: `${tematica}`, inline: false },
                    { name: '❗ Duración / Spots', value: `${spots}`, inline: true },
                    { name: '❗ Lugar de Inicio', value: `${ubicacion}`, inline: true }
                )
                .setColor('#00FF7F');

            if (urlImagen) embedMeet.setImage(urlImagen);

            await interaction.reply({ content: 'Lanzando Car Meet...', ephemeral: true });
            const msg = await interaction.channel.send({ content: '@everyone', embeds: [embedMeet] });
            await msg.react('✅');

            global.mapaVotos.set(msg.id, new Set());
        }

        if (sub === 'release') {
            const idInicio = interaction.options.getString('id_inicio');
            const tipo = interaction.options.getString('tipo');

            if (!global.mapaVotos || !global.mapaVotos.has(idInicio)) {
                return interaction.reply({ content: '❌ El ID de mensaje no es válido o el bot se reinició borrando la memoria.', ephemeral: true });
            }

            const titulo = tipo === 'rp' ? '__SWFL Roleplay Release__' : '__SWFL Meet Release__';
            const color = tipo === 'rp' ? '#1E90FF' : '#00FF7F';

            const embedRelease = new EmbedBuilder()
                .setTitle(titulo)
                .setDescription(`> **Anfitrión:** <@${interaction.user.id}>\n\nLa sesión fue oficialmente lanzada. Si aportaste tu reacción en el mensaje de inicio, toca el botón de abajo para obtener el acceso.\n\n⚠️ *Filtrar el enlace directo es motivo de ban.*`)
                .setColor(color);

            if (urlImagen) embedRelease.setImage(urlImagen);

            const fila = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`link_session_${idInicio}`)
                    .setLabel('Link de la Sesión')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ content: 'Lanzando release...', ephemeral: true });
            await interaction.channel.send({ content: '@everyone', embeds: [embedRelease], components: [fila] });
        }
    }
};

export default command;
