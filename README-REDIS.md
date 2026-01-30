# Redis Migration Guide

## Overview
This document outlines the migration from Replit Database to Redis for the Titan Bot project.

## What Was Changed

### 1. Dependencies
- Added `redis` package to `package.json`
- Removed dependency on `@replit/database`

### 2. New Files Created
- `src/utils/redisDatabase.js` - Redis client wrapper with connection management
- `src/config/redis.js` - Redis configuration settings
- `test-redis.js` - Test script for Redis integration

### 3. Modified Files
- `src/utils/database.js` - Updated to use Redis with fallback to memory storage
- `src/services/database.js` - Updated to use Redis with fallback
- `src/services/leveling.js` - Updated to use Redis with fallback
- `src/app.js` - Updated import path for database functions
- Removed `src/utils/databaseInit.js` - No longer needed

## Features

### Redis Features
- **Connection Management**: Automatic reconnection with exponential backoff
- **TTL Support**: Set expiration on keys
- **Increment/Decrement**: Atomic counter operations
- **Key Listing**: Find keys by prefix
- **Health Monitoring**: Connection status tracking

### Fallback System
- **Memory Storage**: Automatic fallback when Redis is unavailable
- **Backward Compatibility**: Maintains existing API
- **Graceful Degradation**: Bot continues functioning without Redis

## Configuration

### Environment Variables
```bash
# Redis connection URL (optional, defaults to localhost)
REDIS_URL=redis://localhost:6379

# Redis database number (optional, defaults to 0)
REDIS_DB=0
```

### Redis Configuration
The `src/config/redis.js` file contains detailed configuration options:
- Connection settings
- Default TTL values for different data types
- Key prefixes
- Feature toggles

## Usage

### Basic Operations
```javascript
import { DatabaseWrapper } from './src/utils/database.js';

const db = new DatabaseWrapper();
await db.initialize();

// Set a value
await db.set('key', { data: 'value' });

// Get a value
const value = await db.get('key', 'default');

// Delete a key
await db.delete('key');

// List keys by prefix
const keys = await db.list('prefix:');

// Increment counter
const count = await db.increment('counter', 1);

// Set TTL
await db.set('temp', 'data', 3600); // expires in 1 hour
```

### Direct Redis Access
```javascript
import { redisDb } from './src/utils/redisDatabase.js';

await redisDb.connect();
const client = redisDb.client;
// Use Redis client directly
```

## Testing

Run the Redis integration test:
```bash
node test-redis.js
```

This test verifies:
- Redis connection
- Basic CRUD operations
- Increment/decrement operations
- TTL functionality
- Error handling
- Fallback behavior

## Migration Benefits

### Performance
- **Faster Operations**: Redis is significantly faster than Replit Database
- **Atomic Operations**: Built-in support for atomic increments/decrements
- **Memory Efficiency**: Optimized data structures

### Reliability
- **Persistent Storage**: Data persists across bot restarts
- **Connection Pooling**: Better connection management
- **Health Monitoring**: Automatic reconnection on failures

### Scalability
- **Pub/Sub Support**: Ready for future real-time features
- **Clustering**: Can scale to multiple Redis instances
- **Data Types**: Support for various Redis data structures

## Troubleshooting

### Redis Connection Issues
1. Ensure Redis server is running: `redis-server`
2. Check connection URL in environment variables
3. Verify network connectivity to Redis server

### Fallback Mode
If Redis is unavailable, the bot will automatically fall back to memory storage. Check logs for:
- `Redis connection failed, using fallback`
- `Using in-memory storage as fallback`

### Performance Issues
1. Monitor Redis memory usage: `redis-cli info memory`
2. Set appropriate TTL for temporary data
3. Use key prefixes for better organization

## Backward Compatibility

The migration maintains full backward compatibility:
- All existing database functions work unchanged
- Data structure remains the same
- No breaking changes to the API

## Next Steps

1. **Deploy Redis Server**: Set up Redis in your production environment
2. **Configure Environment**: Set `REDIS_URL` in production
3. **Monitor Performance**: Use Redis monitoring tools
4. **Optimize TTL**: Review and optimize key expiration settings
5. **Backup Strategy**: Implement Redis backup and persistence

## Support

For issues related to the Redis migration:
1. Check the test script output
2. Review Redis logs
3. Verify configuration in `src/config/redis.js`
4. Check environment variables
