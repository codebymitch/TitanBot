import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsDir = path.join(__dirname, '../src/commands');

let filesChecked = 0;
let filesUpdated = 0;

async function fixDoubleInteractionParam() {
    console.log('🔍 Fixing double interaction parameter issue...\n');

    const categories = await fs.readdir(commandsDir, { withFileTypes: true });

    for (const category of categories) {
        if (!category.isDirectory()) continue;

        const categoryPath = path.join(commandsDir, category.name);
        await processDirectory(categoryPath, category.name);
        
        const modulesPath = path.join(categoryPath, 'modules');
        try {
            const modulesStat = await fs.stat(modulesPath);
            if (modulesStat.isDirectory()) {
                await processDirectory(modulesPath, `${category.name}/modules`);
            }
        } catch (err) {}
    }

    console.log(`\n✅ Fixed ${filesUpdated} files`);
}

async function processDirectory(dirPath, displayPath) {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const filePath = path.join(dirPath, file);
        filesChecked++;

        try {
            let content = await fs.readFile(filePath, 'utf-8');
            const originalContent = content;

            // Fix interaction.editReply(interaction, ...) -> interaction.editReply(...)
            content = content.replace(/interaction\.editReply\(interaction,\s*/g, 'interaction.editReply(');
            
            // Fix interaction.reply(interaction, ...) -> interaction.reply(...)
            content = content.replace(/interaction\.reply\(interaction,\s*/g, 'interaction.reply(');

            if (content !== originalContent) {
                await fs.writeFile(filePath, content, 'utf-8');
                filesUpdated++;
                console.log(`✅ Fixed: ${displayPath}/${file}`);
            }
        } catch (error) {
            console.error(`❌ Error: ${displayPath}/${file}:`, error.message);
        }
    }
}

fixDoubleInteractionParam().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
