import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsDir = path.join(__dirname, '../src/commands');

let filesFixed = 0;

async function fixMissingImports() {
    console.log('🔍 Fixing missing InteractionHelper imports...\n');

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

    console.log(`\n✅ Fixed ${filesFixed} files`);
}

async function processDirectory(dirPath, displayPath) {
    const files = await fs.readdir(dirPath);

    for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const filePath = path.join(dirPath, file);

        try {
            let content = await fs.readFile(filePath, 'utf-8');
            
            // Check if file uses InteractionHelper but doesn't import it
            const usesInteractionHelper = /InteractionHelper\.safeDefer/.test(content);
            const hasImport = /import.*InteractionHelper/.test(content);

            if (usesInteractionHelper && !hasImport) {
                // Find the last import statement
                const importLines = content.match(/^import .+;?\n/gm);
                if (importLines && importLines.length > 0) {
                    const lastImport = importLines[importLines.length - 1];
                    const lastImportIndex = content.lastIndexOf(lastImport);
                    const insertPosition = lastImportIndex + lastImport.length;
                    
                    // Determine the correct relative path based on file location
                    let importPath = '../../utils/interactionHelper.js';
                    if (displayPath.includes('/modules')) {
                        importPath = '../../../utils/interactionHelper.js';
                    }
                    
                    const importStatement = `import { InteractionHelper } from '${importPath}';\n`;
                    
                    content = content.substring(0, insertPosition) + importStatement + content.substring(insertPosition);
                    
                    await fs.writeFile(filePath, content, 'utf-8');
                    filesFixed++;
                    console.log(`✅ Fixed: ${displayPath}/${file}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error processing ${displayPath}/${file}:`, error.message);
        }
    }
}

fixMissingImports().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
