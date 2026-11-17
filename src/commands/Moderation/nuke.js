const Discord = require('discord.js');

module.exports = {
    name: 'nuke',
    description: 'Nukes a channel',
    run: async (client, message, args) => {
        if (!message.member.permissions.has('MANAGE_CHANNELS')) {
            return message.reply('<:x2:857535178465083402> You do not have the permission to do this!');
        }

        if (!message.guild.me.hasPermission('MANAGE_CHANNELS')) {
            return message.reply('<:x2:857535178465083402> I do not have the right permissions to do this please contact a Mod/Admin to fix this!');
        }

        const clearchannel = message.channel;
        const filter = m => m.author.id === message.author.id;

        message.reply('Are you sure you want to nuke this channel? Type: `yes` or `no`. You have 10 seconds...')
            .then(reply => reply.delete({ timeout: 10000 }));

        message.channel.awaitMessages(filter, {
            max: 1,
            time: 10000
        }).then(collected => {
            const answer = collected.first();

            if (!answer) return;

            if (answer.content.toLowerCase() === 'no') {
                return message.reply('I have cancelled the nuke!');
            }

            if (answer.content.toLowerCase() === 'yes') {
                const embed = new Discord.MessageEmbed()
                    .setColor('#FF0000')
                    .setTitle('Nuked!')
                    .setFooter('Made by x')
                    .setDescription('first')
                    .setTimestamp();

                clearchannel.clone().then(newChannel => {
                    newChannel.send(embed);
                });

                clearchannel.delete();
            }
        }).catch(() => {
            message.reply('Your Time is over...');
        });
    }
};
