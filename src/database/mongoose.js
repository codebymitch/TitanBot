/**
 * MongoDB/Mongoose Connection Module
 * 
 * Handles the connection to MongoDB for the Middleman system.
 * Uses Mongoose ODM for schema validation and data management.
 */

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import mmConfig from '../config/mmConfig.js';

let isConnected = false;

/**
 * Initialize MongoDB connection
 * @returns {Promise<typeof mongoose>} The mongoose instance
 */
async function connectMongoDB() {
  if (isConnected) {
    logger.info('MongoDB connection already established');
    return mongoose;
  }

  try {
    const mongoUri = mmConfig.mongoUri;
    
    if (!mongoUri || mongoUri === 'mongodb://localhost:27017/cbloxbot_mm') {
      logger.warn('MongoDB URI not configured. Using default localhost connection.');
    }

    const connectionOptions = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    };

    await mongoose.connect(mongoUri, connectionOptions);
    
    isConnected = true;
    logger.info('✅ MongoDB connection established successfully');
    
    // Handle connection events
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
      isConnected = false;
    });

    // Handle process termination
    process.on('SIGINT', async () => {
      await disconnectMongoDB();
      process.exit(0);
    });

    return mongoose;
  } catch (error) {
    logger.error('Failed to connect to MongoDB:', error.message);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectMongoDB() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
  }
}

/**
 * Get the current connection status
 * @returns {Object} Connection status information
 */
function getConnectionStatus() {
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name
  };
}

/**
 * Execute a function with MongoDB connection guarantee
 * @param {Function} fn - Async function to execute
 * @returns {Promise<any>} Result of the function
 */
async function withMongoDB(fn) {
  if (!isConnected) {
    await connectMongoDB();
  }
  return fn();
}

export {
  connectMongoDB,
  disconnectMongoDB,
  getConnectionStatus,
  withMongoDB,
  isConnected
};

export default {
  connect: connectMongoDB,
  disconnect: disconnectMongoDB,
  getStatus: getConnectionStatus,
  withDB: withMongoDB
};