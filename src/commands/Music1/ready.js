const Discord = require('discord.js');
const { Chalk } = require('chalk');
const chalk = new Chalk();

module.exports = (client, node) => {
    console.log(chalk.blue(chalk.bold(`System`)), (chalk.white(`>>`)), chalk.red(`Lavalink`), chalk.green(`connected!`))
};