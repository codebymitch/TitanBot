import { DataTypes } from 'sequelize';
import { sequelize } from '../database.js';

const welcomeSystem = sequelize.define('welcomeSystem', {
    guildId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
        unique: true
    },
    // Welcome message settings
    welcomeEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    welcomeChannel: {
        type: DataTypes.STRING,
        allowNull: true
    },
    welcomeMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: 'Welcome {user} to {server}! We now have {memberCount} members!'
    },
    welcomeImage: {
        type: DataTypes.STRING,
        allowNull: true
    },
    welcomePing: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    
    // Goodbye message settings
    goodbyeEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    goodbyeChannel: {
        type: DataTypes.STRING,
        allowNull: true
    },
    goodbyeMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: '{user} has left the server. We now have {memberCount} members.'
    },
    goodbyeImage: {
        type: DataTypes.STRING,
        allowNull: true
    },
    
    // Auto-role settings
    autoRoles: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: []
    },
    
    // Timestamps
    createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Create the table if it doesn't exist
welcomeSystem.sync({ alter: true }).catch(console.error);

module.exports = welcomeSystem;
