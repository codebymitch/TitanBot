const { Chalk } = require("chalk");
const chalk = new Chalk();

module.exports = (client, node, error) => {
  const errorMessage =
    error instanceof Error
      ? error.message
      : String(error ?? "Unknown Shoukaku error");
  const nodeName = node?.name ?? node ?? "Unknown node";

  console.log(
    chalk.red(chalk.bold(`ERROR`)),
    chalk.white(`>>`),
    chalk.white(`Node`),
    chalk.red(`${nodeName}`),
    chalk.white(`had an error:`),
    chalk.red(errorMessage),
  );
};
