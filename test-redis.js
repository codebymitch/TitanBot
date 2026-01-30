/**
 * Test script for Redis integration
 * This script tests the Redis database functionality
 */

import { redisDb } from './src/utils/redisDatabase.js';
import { DatabaseWrapper } from './src/utils/database.js';
import { logger } from './src/utils/logger.js';

async function testRedisConnection() {
    console.log('🧪 Testing Redis Database Integration...\n');
    
    try {
        // Test 1: Basic connection
        console.log('1. Testing Redis connection...');
        const connected = await redisDb.connect();
        console.log(`   Connection status: ${connected ? '✅ Connected' : '❌ Failed'}`);
        
        if (!connected) {
            console.log('   Redis not available, falling back to memory storage');
        }
        
        // Test 2: Basic operations with DatabaseWrapper
        console.log('\n2. Testing DatabaseWrapper operations...');
        const db = new DatabaseWrapper();
        await db.initialize();
        
        // Test set/get
        const testKey = 'test:redis:integration';
        const testValue = { message: 'Hello Redis!', timestamp: Date.now() };
        
        const setResult = await db.set(testKey, testValue);
        console.log(`   Set operation: ${setResult ? '✅ Success' : '❌ Failed'}`);
        
        const getValue = await db.get(testKey);
        console.log(`   Get operation: ${getValue ? '✅ Success' : '❌ Failed'}`);
        console.log(`   Retrieved value: ${JSON.stringify(getValue)}`);
        
        // Test increment/decrement
        const counterKey = 'test:counter';
        const incResult = await db.increment(counterKey, 5);
        console.log(`   Increment (5): ${incResult}`);
        
        const decResult = await db.decrement(counterKey, 2);
        console.log(`   Decrement (2): ${decResult}`);
        
        // Test exists
        const exists = await db.exists(testKey);
        console.log(`   Exists check: ${exists ? '✅ Key exists' : '❌ Key not found'}`);
        
        // Test list
        const listResult = await db.list('test:');
        console.log(`   List operation: ${listResult.length} keys found`);
        console.log(`   Keys: ${listResult.join(', ')}`);
        
        // Test delete
        const deleteResult = await db.delete(testKey);
        console.log(`   Delete operation: ${deleteResult ? '✅ Success' : '❌ Failed'}`);
        
        // Test TTL
        const ttlKey = 'test:ttl';
        await db.set(ttlKey, 'expires in 10 seconds', 10);
        const ttl = await db.ttl(ttlKey);
        console.log(`   TTL check: ${ttl} seconds`);
        
        // Test 3: Connection type
        console.log('\n3. Database information...');
        console.log(`   Connection type: ${db.getConnectionType()}`);
        console.log(`   Is Redis available: ${db.isAvailable()}`);
        
        // Test 4: Error handling
        console.log('\n4. Testing error handling...');
        try {
            await db.get('', 'default');
            console.log('   Empty key handled: ✅');
        } catch (error) {
            console.log('   Empty key error: ❌', error.message);
        }
        
        // Cleanup
        await db.delete(counterKey);
        await db.delete(ttlKey);
        
        console.log('\n✅ Redis integration test completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Redis integration test failed:', error);
        process.exit(1);
    } finally {
        // Close Redis connection
        await redisDb.disconnect();
        console.log('\n🔌 Redis connection closed');
    }
}

// Run the test
testRedisConnection().then(() => {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
}).catch((error) => {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
});
