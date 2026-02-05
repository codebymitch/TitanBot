import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsDir = path.join(__dirname, '../src/commands');

let filesChecked = 0;
let filesUpdated = 0;
const updatedFiles = [];

async function fixAllDeferIssues() {
    console.log('🔍 Fixing all defer-related issues in commands...\n');

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

            // Remove any interaction.deferReply() calls in execute functions
            content = content.replace(/await interaction\.deferReply\(\s*\{?\s*\}?\s*\);?\s*\n?/g, '');
            
            // Remove InteractionHelper.safeExecute wrapper and extract inner function
            content = content.replace(
                /await InteractionHelper\.safeExecute\(\s*interaction,\s*async \(\) => \{([\s\S]*?)\}\s*\);/g,
                (match, innerCode) => {
                    // Remove the "safeExecute already defers" comment
                    innerCode = innerCode.replace(/\/\/ safeExecute already defers\s*\n/g, '');
                    return innerCode.trim();
                }
            );

            // Replace InteractionHelper.safeEditReply with interaction.editReply
            content = content.replace(/InteractionHelper\.safeEditReply\(/g, 'interaction.editReply(');
            
            // Replace InteractionHelper.safeReply with interaction.reply
            content = content.replace(/InteractionHelper\.safeReply\(/g, 'interaction.reply(');

            // Remove unused InteractionHelper imports if no longer needed
            const stillUsesInteractionHelper = /InteractionHelper\./.test(content);
            if (!stillUsesInteractionHelper) {
                content = content.replace(/import \{ InteractionHelper \} from ['"][^'"]+['"];\s*\n/g, '');
            }

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

fixAllDeferIssues().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
