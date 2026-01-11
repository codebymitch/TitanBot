// scripts/update-imports.js
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Files to update
const filesToUpdate = [
  'src/utils/giveaways.js',
  'src/utils/helpers.js',
  'src/utils/database.js',
  'src/utils/economy.js',
  'src/services/economy.js',
  'src/services/guildConfig.js',
  'commands/Search/define.js',
  'commands/Search/movie.js',
  'commands/Search/google.js',
  'commands/Search/urban.js',
  'commands/Community/apply.js',
  'commands/Community/app-admin.js',
  'commands/Counter/counterlist.js',
  'commands/Counter/counterdelete.js',
  'commands/Counter/countercreate.js'
];

// Update imports in each file
async function updateImports() {
  for (const file of filesToUpdate) {
    try {
      const filePath = path.join(rootDir, file);
      let content = await readFile(filePath, 'utf8');
      
      // Update the import statement
      content = content.replace(
        /from ['"]\.\.\/bot_config['"]/g,
        "from '../../src/config/bot.js'"
      );
      
      // Write the updated content back to the file
      await writeFile(filePath, content, 'utf8');
      console.log(`Updated imports in ${file}`);
    } catch (error) {
      console.error(`Error updating ${file}:`, error.message);
    }
  }
}

// Run the update
updateImports().catch(console.error);