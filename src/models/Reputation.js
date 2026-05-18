/**
 * Reputation Model
 * 
 * MongoDB schema for user reputation in the middleman system.
 * Tracks successful trades and reputation given by other users.
 */

import mongoose from 'mongoose';

const ReputationSchema = new mongoose.Schema({
  // Discord user ID
  userId: {
    type: String,
    required: true,
    trim: true
  },

  // Discord guild ID
  guildId: {
    type: String,
    required: true,
    trim: true
  },

  // Total number of successful trades
  successfulTrades: {
    type: Number,
    default: 0,
    min: 0
  },

  // Total number of cancelled/failed trades
  cancelledTrades: {
    type: Number,
    default: 0,
    min: 0
  },

  // Array of reputation entries given by others
  reps: [{
    // User who gave the reputation
    givenBy: {
      type: String,
      required: true,
      trim: true
    },

    // Type of reputation (positive, negative, neutral)
    type: {
      type: String,
      enum: ['positive', 'negative', 'neutral'],
      default: 'positive'
    },

    // Related ticket ID
    ticketId: {
      type: String,
      default: null
    },

    // Optional comment/reason
    comment: {
      type: String,
      default: '',
      maxlength: 500
    },

    // When the reputation was given
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Role in trades (buyer, seller, both)
  primaryRole: {
    type: String,
    enum: ['buyer', 'seller', 'both'],
    default: 'both'
  },

  // Last trade timestamp
  lastTradeAt: {
    type: Date,
    default: null
  },

  // Account creation timestamp
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for unique user per guild
ReputationSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Index for searching reputation by user
ReputationSchema.index({ userId: 1 });
ReputationSchema.index({ guildId: 1 });

// Static method to get or create reputation
ReputationSchema.statics.getOrCreate = async function(userId, guildId) {
  let reputation = await this.findOne({ userId, guildId });
  
  if (!reputation) {
    reputation = new this({ userId, guildId });
    await reputation.save();
  }
  
  return reputation;
};

// Static method to get top users by reputation
ReputationSchema.statics.getTopUsers = async function(guildId, limit = 10) {
  return await this.find({ guildId })
    .sort({ successfulTrades: -1, 'reps.type': -1 })
    .limit(limit)
    .lean();
};

// Instance method to add a successful trade
ReputationSchema.methods.addSuccessfulTrade = async function() {
  this.successfulTrades += 1;
  this.lastTradeAt = new Date();
  return await this.save();
};

// Instance method to add a cancelled trade
ReputationSchema.methods.addCancelledTrade = async function() {
  this.cancelledTrades += 1;
  this.lastTradeAt = new Date();
  return await this.save();
};

// Instance method to add reputation
ReputationSchema.methods.addReputation = async function(givenBy, type, ticketId = null, comment = '') {
  // Check if this user already gave reputation for this ticket
  const existingRep = this.reps.find(r => r.givenBy === givenBy && r.ticketId === ticketId);
  
  if (existingRep) {
    // Update existing reputation
    existingRep.type = type;
    existingRep.comment = comment;
    existingRep.createdAt = new Date();
  } else {
    // Add new reputation entry
    this.reps.push({
      givenBy,
      type,
      ticketId,
      comment
    });
  }
  
  return await this.save();
};

// Instance method to get reputation summary
ReputationSchema.methods.getSummary = function() {
  const positiveReps = this.reps.filter(r => r.type === 'positive').length;
  const negativeReps = this.reps.filter(r => r.type === 'negative').length;
  const neutralReps = this.reps.filter(r => r.type === 'neutral').length;
  
  return {
    userId: this.userId,
    successfulTrades: this.successfulTrades,
    cancelledTrades: this.cancelledTrades,
    positiveReps,
    negativeReps,
    neutralReps,
    totalReps: this.reps.length,
    reputationScore: positiveReps - negativeReps,
    lastTradeAt: this.lastTradeAt,
    primaryRole: this.primaryRole
  };
};

// Virtual for reputation score
ReputationSchema.virtual('reputationScore').get(function() {
  const positive = this.reps.filter(r => r.type === 'positive').length;
  const negative = this.reps.filter(r => r.type === 'negative').length;
  return positive - negative;
});

// Virtual for trade success rate
ReputationSchema.virtual('successRate').get(function() {
  const total = this.successfulTrades + this.cancelledTrades;
  if (total === 0) return 100;
  return Math.round((this.successfulTrades / total) * 100);
});

const Reputation = mongoose.models.Reputation || mongoose.model('Reputation', ReputationSchema);

export default Reputation;