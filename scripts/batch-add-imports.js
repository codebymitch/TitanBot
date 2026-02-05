import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of files that need the import added
const filesToFix = [
    'src/commands/Birthday/birthday.js',
    'src/commands/Config/config.js',
    'src/commands/Core/commandlist.js',
    'src/commands/Core/help.js',
    'src/commands/Core/invite.js',
    'src/commands/Core/ping.js',
    'src/commands/Core/stats.js',
    'src/commands/Core/support.js',
    'src/commands/Core/uptime.js',
    'src/commands/Economy/beg.js',
    'src/commands/Economy/buy.js',
    'src/commands/Economy/crime.js',
    'src/commands/Economy/daily.js',
    'src/commands/Economy/deposit.js',
    'src/commands/Economy/eleaderboard.js',
    'src/commands/Economy/gamble.js',
    'src/commands/Economy/inventory.js',
    'src/commands/Economy/mine.js',
    'src/commands/Economy/pay.js',
    'src/commands/Economy/rob.js',
    'src/commands/Economy/shop.js',
    'src/commands/Economy/slut.js',
    'src/commands/Economy/withdraw.js',
    'src/commands/Economy/work.js',
    'src/commands/Fun/fact.js',
    'src/commands/Fun/fight.js',
    'src/commands/Fun/filp.js',
    'src/commands/Fun/mock.js',
    'src/commands/Fun/reverse.js',
    'src/commands/Fun/roll.js',
    'src/commands/Fun/ship.js',
    'src/commands/Fun/wanted.js',
    'src/commands/Search/define.js',
    'src/commands/Search/google.js',
    'src/commands/Search/movie.js',
    'src/commands/Search/urban.js',
    'src/commands/Tools/baseconvert.js',
    'src/commands/Tools/calculate.js',
    'src/commands/Tools/hexcolor.js',
    'src/commands/Tools/randomuser.js',
    'src/commands/Utility/avatar.js',
    'src/commands/Utility/serverinfo.js',
    'src/commands/Welcome/autorole.js',
    'src/commands/Welcome/goodbye.js',
    'src/commands/Welcome/welcome.js'
];

let filesFixed = 0;

async function fixImports() {
    console.log('🔍 Adding missing InteractionHelper imports...\n');

    for (const relPath of filesToFix) {
        const filePath = path.join(__dirname, '..', relPath);
        
        try {
            let content = await fs.readFile(filePath, 'utf-8');
            
            // Check if already has the import
            if (/import.*InteractionHelper/.test(content)) {
                console.log(`⏭️  Skipped (already has import): ${relPath}`);
                continue;
            }
            
            // Find the position after the last import
            const lines = content.split('\n');
            let lastImportIndex = -1;
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().startsWith('import ')) {
                    lastImportIndex = i;
                }
            }
            
            if (lastImportIndex !== -1) {
                // Insert the import after the last import line
                lines.splice(lastImportIndex + 1, 0, "import { InteractionHelper } from '../../utils/interactionHelper.js';");
                
                content = lines.join('\n');
                await fs.writeFile(filePath, content, 'utf-8');
                filesFixed++;
                console.log(`✅ Fixed: ${relPath}`);
            } else {
                console.log(`⚠️  No import section found: ${relPath}`);
            }
        } catch (error) {
            console.error(`❌ Error processing ${relPath}:`, error.message);
        }
    }

    console.log(`\n✅ Successfully fixed ${filesFixed} files`);
}

fixImports().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
