import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsDir = path.join(__dirname, '../src/commands');

let filesChecked = 0;
let filesUpdated = 0;
const updatedFiles = [];

async function updateCommandFiles() {
    console.log('🔍 Scanning commands for files needing InteractionHelper...\n');

    const categories = await fs.readdir(commandsDir, { withFileTypes: true });

    for (const category of categories) {
        if (!category.isDirectory()) continue;

        const categoryPath = path.join(commandsDir, category.name);
        
        // Check main category files
        await processDirectory(categoryPath, category.name);
        
        // Check modules subdirectory if it exists
        const modulesPath = path.join(categoryPath, 'modules');
        try {
            const modulesStat = await fs.stat(modulesPath);
            if (modulesStat.isDirectory()) {
                await processDirectory(modulesPath, `${category.name}/modules`);
            }
        } catch (err) {
            // modules directory doesn't exist, skip
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
    } else {
        console.log('✨ No files needed updating!');
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

            // Check if file has execute function but no InteractionHelper
            const hasExecute = /async execute\(interaction/.test(content);
            const hasInteractionHelper = /InteractionHelper/.test(content);

            if (hasExecute && !hasInteractionHelper) {
                // Add InteractionHelper import after other imports
                const importMatch = content.match(/(import .+ from ['"].+['"];?\n)+/);
                if (importMatch) {
                    const lastImportEnd = importMatch[0].length;
                    const beforeImports = content.substring(0, lastImportEnd);
                    const afterImports = content.substring(lastImportEnd);
                    
                    // Check if it already has utils/embeds import to add after it
                    if (/import .+ from ['"].*utils\/embeds/.test(beforeImports)) {
                        content = beforeImports.replace(
                            /(import .+ from ['"].*utils\/embeds['"];?\n)/,
                            '$1import { InteractionHelper } from \'../../utils/interactionHelper.js\';\n'
                        );
                    } else {
                        content = beforeImports + `import { InteractionHelper } from '../../utils/interactionHelper.js';\n` + afterImports;
                    }
                }

                // Add safeDefer at the start of execute function
                // Look for async execute(interaction and add defer after it
                content = content.replace(
                    /(async execute\(interaction[^)]*\)\s*\{)(\s*)(try\s*\{)?/,
                    (match, funcStart, whitespace, tryBlock) => {
                        const deferCode = `\n        const deferSuccess = await InteractionHelper.safeDefer(interaction, { flags: ['Ephemeral'] });\n        if (!deferSuccess) return;\n`;
                        if (tryBlock) {
                            return funcStart + deferCode + whitespace + tryBlock;
                        } else {
                            return funcStart + deferCode + whitespace;
                        }
                    }
                );

                // Replace interaction.reply( with interaction.editReply( (but not in comments)
                content = content.replace(/(?<!\/\/.*)interaction\.reply\(/g, 'interaction.editReply(');

                if (content !== originalContent) {
                    await fs.writeFile(filePath, content, 'utf-8');
                    filesUpdated++;
                    updatedFiles.push(`${displayPath}/${file}`);
                    console.log(`✅ Updated: ${displayPath}/${file}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error processing ${displayPath}/${file}:`, error.message);
        }
    }
}

updateCommandFiles().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
