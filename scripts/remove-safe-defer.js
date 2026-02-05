import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsDir = path.join(__dirname, '../src/commands');

let filesChecked = 0;
let filesUpdated = 0;
const updatedFiles = [];

async function removeInteractionHelper() {
    console.log('🔍 Removing InteractionHelper.safeDefer() calls...\n');

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
        } catch (err) {
            // modules directory doesn't exist
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log('='.repeat(60));
    console.log(`Files checked: ${filesChecked}`);
    console.log(`Files updated: ${filesUpdated}\n`);

    if (updatedFiles.length > 0) {
        console.log('Updated files:');
        updatedFiles.forEach((file, index) => {
            console.log(`  ${index + 1}. ${file}`);
        });
    }
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

            // Remove the InteractionHelper.safeDefer lines
            const deferPattern = /\s*const deferSuccess = await InteractionHelper\.safeDefer\(interaction[^)]*\);\s*\n\s*if \(!deferSuccess\) return;\s*\n\s*/g;
            content = content.replace(deferPattern, '\n');

            // Remove InteractionHelper import if it's no longer used
            const stillUsesInteractionHelper = /InteractionHelper\.(safeReply|safeEditReply)/.test(content);
            if (!stillUsesInteractionHelper) {
                // Remove the import line
                content = content.replace(/import \{ InteractionHelper \} from ['"][^'"]+['"];\n/g, '');
            }

            // Change interaction.editReply back to interaction.reply for commands
            // But be careful - only change in execute functions, not in error handlers
            content = content.replace(
                /async execute\(interaction[^)]*\)\s*\{[\s\S]*?\n\s*}/g,
                (match) => {
                    // Only replace editReply with reply if there's no defer/replied check
                    return match.replace(/interaction\.editReply\(/g, 'interaction.reply(');
                }
            );

            if (content !== originalContent) {
                await fs.writeFile(filePath, content, 'utf-8');
                filesUpdated++;
                updatedFiles.push(`${displayPath}/${file}`);
                console.log(`✅ Updated: ${displayPath}/${file}`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${displayPath}/${file}:`, error.message);
        }
    }
}

removeInteractionHelper().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
