/**
 * Ticket Model
 * 
 * MongoDB schema for middleman trade tickets.
 * Stores all information about a trade including participants, status, and timestamps.
 */

import mongoose from 'mongoose';

const TicketSchema = new mongoose.Schema({
  // Discord channel ID where the ticket is created
  channelId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  // Discord guild ID
  guildId: {
    type: String,
    required: true,
    trim: true
  },

  // User ID of the buyer
  buyerId: {
    type: String,
    required: true,
    trim: true
  },

  // User ID of the seller
  sellerId: {
    type: String,
    required: true,
    trim: true
  },

  // User ID of the assigned middleman (optional until assigned)
  middlemanId: {
    type: String,
    default: null,
    trim: true
  },

  // User ID who closed the ticket
  closedBy: {
    type: String,
    default: null,
    trim: true
  },

  // Product or service being traded
  product: {
    type: String,
    required: true,
    trim: true
  },

  // Trade value (can be text description like "50 BRL" or numeric)
  value: {
    type: String,
    required: true,
    trim: true
  },

  // Current status of the ticket
  status: {
    type: String,
    enum: ['waiting_payment', 'payment_received', 'item_delivered', 'trade_completed', 'cancelled'],
    default: 'waiting_payment'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  // When the ticket was closed (null if still open)
  closedAt: {
    type: Date,
    default: null
  },

  // Status history for audit trail
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    changedBy: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],

  // Additional notes or comments
  notes: {
    type: String,
    default: ''
  },

  // Transcript message ID (for referencing the generated transcript)
  transcriptMessageId: {
    type: String,
    default: null
  },

  // Was the trade successful (for reputation calculation)
  tradeSuccessful: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster queries
TicketSchema.index({ guildId: 1, status: 1 });
TicketSchema.index({ buyerId: 1 });
TicketSchema.index({ sellerId: 1 });
TicketSchema.index({ middlemanId: 1 });

// Static method to create a new ticket
TicketSchema.statics.createTicket = async function(data) {
  const ticket = new this({
    ...data,
    statusHistory: [{
      status: data.status || 'waiting_payment',
      changedBy: data.creatorId || 'system',
      timestamp: new Date()
    }]
  });
  
  return await ticket.save();
};

// Instance method to update status
TicketSchema.methods.updateStatus = async function(newStatus, changedBy) {
  this.statusHistory.push({
    status: newStatus,
    changedBy,
    timestamp: new Date()
  });
  
  this.status = newStatus;
  
  // If status is trade_completed or cancelled, close the ticket
  if (newStatus === 'trade_completed' || newStatus === 'cancelled') {
    this.closedAt = new Date();
    this.closedBy = changedBy;
    this.tradeSuccessful = newStatus === 'trade_completed';
  }
  
  return await this.save();
};

// Instance method to assign a middleman
TicketSchema.methods.assignMiddleman = async function(middlemanId) {
  this.middlemanId = middlemanId;
  return await this.save();
};

// Instance method to close the ticket
TicketSchema.methods.closeTicket = async function(closedBy, tradeSuccessful = false) {
  this.closedAt = new Date();
  this.closedBy = closedBy;
  this.tradeSuccessful = tradeSuccessful;
  return await this.save();
};

// Virtual for ticket duration
TicketSchema.virtual('duration').get(function() {
  if (!this.closedAt) return null;
  return this.closedAt - this.createdAt;
});

// Virtual for checking if ticket is open
TicketSchema.virtual('isOpen').get(function() {
  return !this.closedAt;
});

const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);

export default Ticket;