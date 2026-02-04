import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the commands directory
const commandsDir = path.join(__dirname, '../src/commands');

let filesChecked = 0;
let filesFixed = 0;
const issuesFound = [];

async function scanAndFixCommands() {
    console.log('🔍 Scanning commands for interaction.reply() issues...\n');

    // Get all category directories
    const categories = await fs.readdir(commandsDir, { withFileTypes: true });

    for (const category of categories) {
        if (!category.isDirectory()) continue;

        const categoryPath = path.join(commandsDir, category.name);
        const files = await fs.readdir(categoryPath);

        for (const file of files) {
            if (!file.endsWith('.js')) continue;

            const filePath = path.join(categoryPath, file);
            filesChecked++;

            try {
                let content = await fs.readFile(filePath, 'utf-8');
                const originalContent = content;

                // Check if file has interaction.reply( but NOT interaction.deferReply
                // and NOT interaction.followUp and NOT interaction.editReply and NOT interaction.showModal
                const hasReplyIssue = /await\s+interaction\.reply\s*\(/.test(content) &&
                    !/await\s+interaction\.deferReply\s*\(/.test(content);

                if (hasReplyIssue) {
                    issuesFound.push({
                        file: `${category.name}/${file}`,
                        path: filePath
                    });

                    // Replace interaction.reply( with interaction.editReply(
                    content = content.replace(/await\s+interaction\.reply\s*\(/g, 'await interaction.editReply(');

                    // Write back the fixed content
                    await fs.writeFile(filePath, content, 'utf-8');
                    filesFixed++;

                    console.log(`✅ Fixed: ${category.name}/${file}`);
                }
            } catch (error) {
                console.error(`❌ Error processing ${category.name}/${file}:`, error.message);
            }
        }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log('='.repeat(60));
    console.log(`Files checked: ${filesChecked}`);
    console.log(`Files fixed: ${filesFixed}`);
    console.log(`Issues found: ${issuesFound.length}\n`);

    if (issuesFound.length > 0) {
        console.log('Fixed files:');
        issuesFound.forEach((issue, index) => {
            console.log(`  ${index + 1}. ${issue.file}`);
        });
    } else {
        console.log('✨ No issues found! All commands are using the correct reply method.');
    }
}

scanAndFixCommands().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
