import { readdirSync, lstatSync } from "fs";
import { join } from "path";

/**
 * Recursively reads a directory and returns a flat list of file paths.
 * @param {string} dir Path to the directory.
 * @returns {string[]} Array of full file paths.
 */
function getFilesRecursively(dir) {
    const files = [];
    const entries = readdirSync(dir);

    for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = lstatSync(fullPath);

        if (stats.isDirectory()) {
            files.push(...getFilesRecursively(fullPath));
        } else if (fullPath.endsWith(".js")) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Scans all command files and checks for duplicate slash command names.
 */
async function checkDuplicates() {
    // NOTE: Update this path if your command directory is named differently
    const commandsDir = join(process.cwd(), "src/commands");

    console.log(`\n--- Scanning commands directory: ${commandsDir} ---\n`);

    const commandFiles = getFilesRecursively(commandsDir);
    const namesMap = new Map();
    let hasDuplicates = false;

    for (const filePath of commandFiles) {
        try {
            // Dynamically import the command module
            const command = await import(filePath);

            // Check if the imported module has the required 'data' property
            if (command.default && command.default.data) {
                const commandData = command.default.data;
                const commandName = commandData.name;

                if (namesMap.has(commandName)) {
                    hasDuplicates = true;
                    console.error(
                        `❌ DUPLICATE FOUND: '/${commandName}' is registered in both:`,
                    );
                    console.error(`   - ${namesMap.get(commandName)}`);
                    console.error(`   - ${filePath}`);
                    console.error("---");
                } else {
                    namesMap.set(commandName, filePath);
                }
            } else {
                console.warn(
                    `⚠️ Warning: ${filePath} does not export a command with a 'data' property.`,
                );
            }
        } catch (error) {
            console.error(
                `🛑 Error loading command file ${filePath}:`,
                error.message,
            );
        }
    }

    if (!hasDuplicates) {
        console.log("✅ Success! All command names are unique.");
    }

    console.log("\n--- Scan Complete ---\n");
}

// Ensure execution path is compatible with standard Node.js environments
checkDuplicates();
