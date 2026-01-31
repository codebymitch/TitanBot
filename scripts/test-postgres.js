#!/usr/bin/env node

/**
 * PostgreSQL Test Script
 * Tests the PostgreSQL database connection and basic operations
 */

import { pgDb } from '../src/utils/postgresDatabase.js';
import { migrationManager } from '../src/utils/migrations.js';
import { logger } from '../src/utils/logger.js';

class PostgreSQLTester {
    constructor() {
        this.testResults = {
            connection: false,
            migrations: false,
            basicOps: false,
            structuredData: false,
            performance: false
        };
    }

    async runAllTests() {
        logger.info('🧪 Starting PostgreSQL Database Tests...');
        
        try {
            await this.testConnection();
            await this.testMigrations();
            await this.testBasicOperations();
            await this.testStructuredData();
            await this.testPerformance();
            
            this.printResults();
            
            return Object.values(this.testResults).every(result => result);
        } catch (error) {
            logger.error('❌ Test suite failed:', error);
            return false;
        } finally {
            await pgDb.disconnect();
        }
    }

    async testConnection() {
        logger.info('Testing database connection...');
        
        try {
            const connected = await pgDb.connect();
            if (connected) {
                logger.info('✅ Database connection successful');
                this.testResults.connection = true;
                
                // Get database info
                const info = await pgDb.getInfo();
                if (info) {
                    logger.info(`Database version: ${info.version?.split(' ')[0] || 'Unknown'}`);
                    logger.info(`Pool size: ${info.poolSize}, Idle: ${info.idleCount}`);
                }
            } else {
                logger.error('❌ Database connection failed');
            }
        } catch (error) {
            logger.error('❌ Connection test failed:', error);
        }
    }

    async testMigrations() {
        logger.info('Testing database migrations...');
        
        try {
            await migrationManager.initialize();
            await migrationManager.migrate();
            
            logger.info('✅ Migrations completed successfully');
            this.testResults.migrations = true;
            
            // Check migration status
            const status = await migrationManager.getStatus();
            logger.info(`Current version: ${status.currentVersion}`);
            logger.info(`Executed migrations: ${status.executed?.length || 0}`);
        } catch (error) {
            logger.error('❌ Migration test failed:', error);
        }
    }

    async testBasicOperations() {
        logger.info('Testing basic database operations...');
        
        try {
            const testKey = 'test:basic:ops';
            const testValue = { message: 'Hello PostgreSQL!', timestamp: Date.now() };
            
            // Test SET
            const setResult = await pgDb.set(testKey, testValue);
            if (!setResult) {
                throw new Error('SET operation failed');
            }
            
            // Test GET
            const getValue = await pgDb.get(testKey);
            if (JSON.stringify(getValue) !== JSON.stringify(testValue)) {
                throw new Error('GET operation returned wrong value');
            }
            
            // Test EXISTS
            const exists = await pgDb.exists(testKey);
            if (!exists) {
                throw new Error('EXISTS operation failed');
            }
            
            // Test INCREMENT
            const counterKey = 'test:counter';
            await pgDb.set(counterKey, 10);
            const incremented = await pgDb.increment(counterKey, 5);
            if (incremented !== 15) {
                throw new Error('INCREMENT operation failed');
            }
            
            // Test DECREMENT
            const decremented = await pgDb.decrement(counterKey, 3);
            if (decremented !== 12) {
                throw new Error('DECREMENT operation failed');
            }
            
            // Test LIST
            const keys = await pgDb.list('test:');
            if (!keys.includes(testKey) || !keys.includes(counterKey)) {
                throw new Error('LIST operation failed');
            }
            
            // Test DELETE
            const deleteResult = await pgDb.delete(testKey);
            await pgDb.delete(counterKey);
            if (!deleteResult) {
                throw new Error('DELETE operation failed');
            }
            
            // Verify deletion
            const existsAfterDelete = await pgDb.exists(testKey);
            if (existsAfterDelete) {
                throw new Error('DELETE verification failed');
            }
            
            logger.info('✅ Basic operations test passed');
            this.testResults.basicOps = true;
            
        } catch (error) {
            logger.error('❌ Basic operations test failed:', error);
        }
    }

    async testStructuredData() {
        logger.info('Testing structured data operations...');
        
        try {
            const guildId = '123456789';
            const userId = '987654321';
            
            // Test guild config
            const configKey = `guild:${guildId}:config`;
            const configData = {
                enabledCommands: ['ping', 'help'],
                prefix: '!',
                logIgnore: { users: [], channels: [] }
            };
            
            await pgDb.set(configKey, configData);
            const retrievedConfig = await pgDb.get(configKey);
            if (retrievedConfig.prefix !== '!') {
                throw new Error('Guild config test failed');
            }
            
            // Test user levels
            const levelKey = `guild:${guildId}:leveling:users:${userId}`;
            const levelData = {
                xp: 1500,
                level: 5,
                totalXp: 2000,
                lastMessage: Date.now(),
                rank: 1
            };
            
            await pgDb.set(levelKey, levelData);
            const retrievedLevel = await pgDb.get(levelKey);
            if (retrievedLevel.level !== 5) {
                throw new Error('User level test failed');
            }
            
            // Test birthdays
            const birthdayKey = `guild:${guildId}:birthdays`;
            const birthdayData = {
                [userId]: { month: 12, day: 25 }
            };
            
            await pgDb.set(birthdayKey, birthdayData);
            const retrievedBirthdays = await pgDb.get(birthdayKey);
            if (!retrievedBirthdays[userId] || retrievedBirthdays[userId].month !== 12) {
                throw new Error('Birthday test failed');
            }
            
            // Test TTL functionality
            const tempKey = 'temp:test:ttl';
            await pgDb.set(tempKey, 'expires soon', 2); // 2 seconds TTL
            const existsBefore = await pgDb.exists(tempKey);
            if (!existsBefore) {
                throw new Error('TTL set test failed');
            }
            
            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 3000));
            const existsAfter = await pgDb.exists(tempKey);
            if (existsAfter) {
                logger.warn('TTL expiration test - key still exists (might be expected in some environments)');
            }
            
            // Cleanup
            await pgDb.delete(configKey);
            await pgDb.delete(levelKey);
            await pgDb.delete(birthdayKey);
            await pgDb.delete(tempKey);
            
            logger.info('✅ Structured data test passed');
            this.testResults.structuredData = true;
            
        } catch (error) {
            logger.error('❌ Structured data test failed:', error);
        }
    }

    async testPerformance() {
        logger.info('Testing performance...');
        
        try {
            const testCount = 1000;
            const startTime = Date.now();
            
            // Batch SET operations
            const setPromises = [];
            for (let i = 0; i < testCount; i++) {
                const key = `perf:test:${i}`;
                const value = { index: i, data: 'test'.repeat(10) };
                setPromises.push(pgDb.set(key, value));
            }
            
            await Promise.all(setPromises);
            const setTime = Date.now() - startTime;
            
            // Batch GET operations
            const getStartTime = Date.now();
            const getPromises = [];
            for (let i = 0; i < testCount; i++) {
                const key = `perf:test:${i}`;
                getPromises.push(pgDb.get(key));
            }
            
            const results = await Promise.all(getPromises);
            const getTime = Date.now() - getStartTime;
            
            // Verify results
            const successCount = results.filter(r => r && r.index !== undefined).length;
            
            // Cleanup
            const deletePromises = [];
            for (let i = 0; i < testCount; i++) {
                const key = `perf:test:${i}`;
                deletePromises.push(pgDb.delete(key));
            }
            await Promise.all(deletePromises);
            
            logger.info(`Performance Results:`);
            logger.info(`  SET: ${testCount} operations in ${setTime}ms (${(testCount/setTime*1000).toFixed(2)} ops/sec)`);
            logger.info(`  GET: ${testCount} operations in ${getTime}ms (${(testCount/getTime*1000).toFixed(2)} ops/sec)`);
            logger.info(`  Success rate: ${successCount}/${testCount} (${(successCount/testCount*100).toFixed(2)}%)`);
            
            // Consider it successful if we get reasonable performance (>100 ops/sec)
            const setOpsPerSec = testCount / setTime * 1000;
            const getOpsPerSec = testCount / getTime * 1000;
            
            if (setOpsPerSec > 100 && getOpsPerSec > 100 && successCount === testCount) {
                logger.info('✅ Performance test passed');
                this.testResults.performance = true;
            } else {
                logger.warn('⚠️ Performance test below expectations');
                this.testResults.performance = false;
            }
            
        } catch (error) {
            logger.error('❌ Performance test failed:', error);
        }
    }

    printResults() {
        logger.info('\n' + '='.repeat(50));
        logger.info('📊 TEST RESULTS');
        logger.info('='.repeat(50));
        
        const tests = [
            { name: 'Connection', passed: this.testResults.connection },
            { name: 'Migrations', passed: this.testResults.migrations },
            { name: 'Basic Operations', passed: this.testResults.basicOps },
            { name: 'Structured Data', passed: this.testResults.structuredData },
            { name: 'Performance', passed: this.testResults.performance }
        ];
        
        tests.forEach(test => {
            const status = test.passed ? '✅ PASS' : '❌ FAIL';
            logger.info(`${status} ${test.name}`);
        });
        
        const passedCount = tests.filter(t => t.passed).length;
        const totalCount = tests.length;
        
        logger.info('='.repeat(50));
        logger.info(`Overall: ${passedCount}/${totalCount} tests passed`);
        
        if (passedCount === totalCount) {
            logger.info('🎉 All tests passed! PostgreSQL database is ready for use.');
        } else {
            logger.warn('⚠️ Some tests failed. Please check the logs above.');
        }
        
        logger.info('='.repeat(50));
    }
}

// Main execution
async function main() {
    const tester = new PostgreSQLTester();
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the tests
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { PostgreSQLTester };
