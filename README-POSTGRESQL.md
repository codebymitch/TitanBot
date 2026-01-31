# PostgreSQL Migration Guide

## Overview
This document outlines the complete migration from Redis to PostgreSQL for the Titan Bot project.

## What Was Changed

### 1. Dependencies
- Added `pg` package to `package.json` for PostgreSQL connectivity
- Maintained `redis` package for fallback compatibility
- Added migration and testing scripts

### 2. New Files Created
- `src/config/postgres.js` - PostgreSQL configuration settings
- `src/utils/postgresDatabase.js` - PostgreSQL client wrapper with Redis compatibility
- `src/utils/migrations.js` - Database migration management system
- `scripts/migrate-redis-to-postgres.js` - Data migration script
- `scripts/test-postgres.js` - PostgreSQL testing script

### 3. Modified Files
- `src/utils/database.js` - Updated to use PostgreSQL with Redis/memory fallback
- `src/services/database.js` - Updated to use PostgreSQL with Redis/memory fallback
- `package.json` - Added new scripts and PostgreSQL dependency

## Features

### PostgreSQL Features
- **Connection Pooling**: Efficient connection management with configurable pool size
- **Automatic Migrations**: Version-controlled schema updates
- **Structured Data Storage**: Proper relational tables for different data types
- **TTL Support**: Time-based expiration for temporary data
- **Performance Indexes**: Optimized queries for common operations
- **Audit Triggers**: Automatic timestamp updates
- **Health Monitoring**: Connection status and performance metrics

### Fallback System
- **Two-tier Fallback**: PostgreSQL > Memory storage
- **Graceful Degradation**: Bot continues functioning if PostgreSQL is unavailable
- **Backward Compatibility**: Maintains existing Redis API
- **Automatic Migration**: Built-in data migration from Redis to PostgreSQL

## Configuration

### Environment Variables
```bash
# PostgreSQL connection (required for PostgreSQL)
POSTGRES_URL=postgresql://username:password@localhost:5432/titanbot
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=titanbot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=yourpassword
POSTGRES_SSL=false

# Migration settings
AUTO_MIGRATE=false  # Set to true to auto-run migrations on startup
```

### PostgreSQL Configuration
The `src/config/postgres.js` file contains detailed configuration options:
- Connection settings and pooling
- Table names and structure
- Default TTL values for different data types
- Feature toggles and health checks

## Database Schema

### Tables Created
1. **guilds** - Server-specific configurations
2. **users** - User information and profiles
3. **guild_users** - Guild-user relationships
4. **birthdays** - User birthday data
5. **giveaways** - Giveaway information
6. **ticket_data** - Support ticket data
7. **afk_status** - AFK status information
8. **welcome_configs** - Welcome system configurations
9. **leveling_configs** - Leveling system settings
10. **user_levels** - User level and XP data
11. **economy** - Economy system data
12. **invite_tracking** - Invite tracking data
13. **application_roles** - Application system roles
14. **temp_data** - Temporary data with TTL
15. **cache_data** - Cached data with TTL
16. **migrations** - Migration tracking

### Key Features
- **Foreign Key Relationships**: Proper data integrity
- **JSONB Columns**: Flexible data storage for complex objects
- **Indexes**: Optimized performance for common queries
- **Timestamps**: Automatic creation and update tracking
- **TTL Support**: Expiration for temporary data

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

### Migration Operations
```javascript
// Check database connection type
const connectionType = db.getConnectionType(); // 'postgresql' or 'memory'

// Migrate from Redis to PostgreSQL
if (connectionType === 'postgresql') {
    const success = await db.migrateFromRedis();
    console.log('Migration success:', success);
}

// Run database migrations
const migrationSuccess = await db.runMigrations();

// Get migration status
const status = await db.getMigrationStatus();
```

## Migration Process

### Step 1: Setup PostgreSQL
1. Install PostgreSQL on your system
2. Create a database for the bot:
   ```sql
   CREATE DATABASE titanbot;
   CREATE USER titanbot WITH PASSWORD 'yourpassword';
   GRANT ALL PRIVILEGES ON DATABASE titanbot TO titanbot;
   ```

### Step 2: Configure Environment
Set the PostgreSQL environment variables in your `.env` file:
```bash
POSTGRES_URL=postgresql://titanbot:yourpassword@localhost:5432/titanbot
```

### Step 3: Test Connection
```bash
npm run test-postgres
```

### Step 4: Migrate Data (if coming from Redis)
```bash
npm run migrate-redis-to-postgres
```

### Step 5: Start the Bot
```bash
npm start
```

## Scripts

### Available NPM Scripts
- `npm run test-postgres` - Test PostgreSQL connection and operations
- `npm run migrate-redis-to-postgres` - Migrate data from Redis to PostgreSQL
- `npm start` - Start the bot with PostgreSQL priority

### Migration Script Features
- **Progress Tracking**: Real-time migration progress
- **Data Integrity**: Verification of migrated data
- **Error Handling**: Comprehensive error reporting
- **Rollback Support**: Ability to retry failed migrations
- **Performance Optimization**: Batch processing for large datasets

## Performance

### PostgreSQL Benefits
- **ACID Compliance**: Reliable transactions
- **Complex Queries**: Advanced data analysis capabilities
- **Scalability**: Better performance for large datasets
- **Data Integrity**: Proper relationships and constraints
- **Backup/Restore**: Standard database tools

### Performance Metrics
- **Connection Pooling**: Reduces connection overhead
- **Query Optimization**: Automatic query planning
- **Indexing**: Fast lookups for common operations
- **Batch Operations**: Efficient bulk processing

## Troubleshooting

### Connection Issues
1. Verify PostgreSQL is running: `pg_ctl status`
2. Check connection string in environment variables
3. Ensure database and user exist with proper permissions
4. Test connection manually: `psql $POSTGRES_URL`

### Migration Issues
1. Ensure Redis is accessible during migration
2. Check available disk space for PostgreSQL
3. Monitor PostgreSQL logs for errors
4. Verify migration script permissions

### Performance Issues
1. Check PostgreSQL configuration (shared_buffers, work_mem)
2. Monitor connection pool usage
3. Analyze slow queries with `EXPLAIN ANALYZE`
4. Consider additional indexes for common queries

## Monitoring

### Health Checks
The system includes automatic health monitoring:
- Connection status tracking
- Query performance metrics
- Pool utilization monitoring
- Error rate tracking

### Logs
Key log messages to watch for:
- `✅ PostgreSQL Database initialized` - Successful connection
- `Using memory storage as fallback` - PostgreSQL unavailable
- `Migration completed` - Successful data migration
- `Health check failed` - Connection issues

## Backward Compatibility

The migration maintains full backward compatibility:
- All existing database functions work unchanged
- Redis API compatibility preserved for memory storage
- No breaking changes to the bot's functionality
- Automatic fallback ensures continuous operation

## Security Considerations

### Database Security
- Use strong passwords for PostgreSQL user
- Enable SSL for production environments
- Limit database user permissions to required operations
- Regular security updates for PostgreSQL

### Data Protection
- Sensitive data stored in encrypted JSONB columns
- Connection strings in environment variables
- Audit logging for data modifications
- Regular backups recommended

## Next Steps

1. **Production Deployment**: Set up PostgreSQL in production environment
2. **Monitoring Setup**: Implement database monitoring and alerting
3. **Backup Strategy**: Configure automated backups
4. **Performance Tuning**: Optimize PostgreSQL configuration
5. **Security Hardening**: Implement additional security measures

## Support

For issues related to the PostgreSQL migration:
1. Check the test script output: `npm run test-postgres`
2. Review PostgreSQL logs
3. Verify configuration in `src/config/postgres.js`
4. Check environment variables
5. Run migration script with verbose logging
