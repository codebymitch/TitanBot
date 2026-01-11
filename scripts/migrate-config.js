/**
 * Migration script for bot configuration
 * This script helps migrate from the old bot_config.js to the new config structure
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the new config
import { botConfig } from '../src/config/bot.js';

// Try to import the old config (if it exists)
let oldConfig = {};
try {
  const { BotConfig } = require('../bot_config.js');
  oldConfig = BotConfig || {};
  console.log('Found old configuration file. Migrating settings...');
} catch (error) {
  console.log('No old configuration file found. Using defaults.');
}

// Migration mapping from old config to new structure
const migrationMap = {
  // Bot settings
  'bot.status': 'presence.activities[0]',
  'bot.presence': 'presence.status',
  'bot.defaultPrefix': 'commands.prefix',
  'bot.owners': 'commands.owners',
  
  // Economy settings
  'economy.currency.name': 'economy.currency.name',
  'economy.currency.namePlural': 'economy.currency.namePlural',
  'economy.currency.symbol': 'economy.currency.symbol',
  'economy.startingBalance': 'economy.startingBalance',
  'economy.baseBankCapacity': 'economy.baseBankCapacity',
  'economy.dailyAmount': 'economy.dailyAmount',
  'economy.workMin': 'economy.workMin',
  'economy.workMax': 'economy.workMax',
  'economy.begMin': 'economy.begMin',
  'economy.begMax': 'economy.begMax',
  'economy.robSuccessRate': 'economy.robSuccessRate',
  'economy.robFailJailTime': 'economy.robFailJailTime'
};

// Helper function to set nested property
function setNestedProperty(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    // Handle array indices like 'activities[0]'
    const arrayMatch = key.match(/(\w+)\[(\d+)\]/);
    
    if (arrayMatch) {
      const arrayKey = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      
      if (!current[arrayKey]) {
        current[arrayKey] = [];
      }
      
      while (current[arrayKey].length <= index) {
        current[arrayKey].push({});
      }
      
      if (!current[arrayKey][index]) {
        current[arrayKey][index] = {};
      }
      
      current = current[arrayKey][index];
    } else {
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }
  }
  
  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;
}

// Migrate settings
let migratedCount = 0;

Object.entries(migrationMap).forEach(([oldPath, newPath]) => {
  try {
    const value = oldPath.split('.').reduce((obj, key) => obj?.[key], oldConfig);
    if (value !== undefined) {
      setNestedProperty(botConfig, newPath, value);
      migratedCount++;
      console.log(`✓ Migrated: ${oldPath} → ${newPath}`);
    }
  } catch (error) {
    console.warn(`⚠ Could not migrate ${oldPath}:`, error.message);
  }
});

console.log(`\nMigration complete. Successfully migrated ${migratedCount} settings.`);

// Export the merged config for inspection if needed
console.log('\nMerged configuration:');
console.log(JSON.stringify(botConfig, null, 2));
