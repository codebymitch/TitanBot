import fs from 'fs';
import path from 'path';

/**
 * Script to remove all single-line comments from the codebase
 * Excludes: .env.example and src/config/bot.js
 */

function shouldExcludeFile(filePath) {
    const normalizedPath = path.normalize(filePath);
    
    if (normalizedPath.endsWith('.env.example')) {
        return true;
    }
    
    if (normalizedPath.endsWith('bot.js') && normalizedPath.includes(path.join('src', 'config'))) {
        return true;
    }
    
    return false;
}

function removeSingleLineComments(content) {
    const lines = content.split('\n');
    const filteredLines = [];
    
    for (let line of lines) {
        const commentIndex = line.indexOf('//');
        
        if (commentIndex === -1) {
            filteredLines.push(line);
        } else {
            let inString = false;
            let stringChar = '';
            let isComment = true;
            
            for (let i = 0; i < commentIndex; i++) {
                const char = line[i];
                
                if (!inString) {
                    if (char === '"' || char === "'" || char === '`') {
                        inString = true;
                        stringChar = char;
                    }
                } else {
                    if (char === stringChar && line[i - 1] !== '\\') {
                        inString = false;
                        stringChar = '';
                    }
                }
            }
            
            if (!inString) {
                const beforeComment = line.substring(0, commentIndex).trim();
                if (beforeComment.length > 0) {
                    filteredLines.push(beforeComment);
                }
            } else {
                filteredLines.push(line);
            }
        }
    }
    
    return filteredLines.join('\n');
}

function processFile(filePath) {
    if (shouldExcludeFile(filePath)) {
        console.log(`Excluding: ${filePath}`);
        return;
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const processedContent = removeSingleLineComments(content);
        
        if (content !== processedContent) {
            fs.writeFileSync(filePath, processedContent, 'utf8');
            console.log(`Processed: ${filePath}`);
        } else {
            console.log(`No changes needed: ${filePath}`);
        }
    } catch (error) {
        console.error(`Error processing ${filePath}:`, error.message);
    }
}

function walkDirectory(dir, callback) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            if (file !== '.git' && file !== 'node_modules') {
                walkDirectory(filePath, callback);
            }
        } else {
            callback(filePath);
        }
    }
}

const rootDir = process.cwd();
console.log('Starting single-line comment removal...');
console.log(`Root directory: ${rootDir}`);
console.log('Excluding: .env.example and src/config/bot.js');
console.log('---');

walkDirectory(rootDir, processFile);

console.log('---');
console.log('Single-line comment removal completed!');
