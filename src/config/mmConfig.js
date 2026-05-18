/**
 * Middleman Management System Configuration
 * 
 * This configuration file contains all the settings for the Discord Middleman system.
 * Replace the placeholder IDs with actual Discord IDs from your server.
 */

const mmConfig = {
  // Discord Role IDs
  mmRoleId: process.env.MM_ROLE_ID || '',
  staffRoleId: process.env.STAFF_ROLE_ID || '',

  // Channel IDs
  logChannelId: process.env.LOG_CHANNEL_ID || '',
  mmCategoryId: process.env.MM_CATEGORY_ID || '',
  transcriptChannelId: process.env.TRANSCRIPT_CHANNEL_ID || '',

  // Payment Information (displayed in tickets)
  pixKey: process.env.PIX_KEY || '',
  paypalEmail: process.env.PAYPAL_EMAIL || '',

  // MongoDB Connection
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/cbloxbot_mm',

  // Ticket Settings
  ticketNamePrefix: 'trade',
  ticketTopicTemplate: (buyer, seller, product) => 
    `Middleman Trade | Buyer: ${buyer} | Seller: ${seller} | Product: ${product}`,

  // Status options for tickets
  statuses: {
    waitingPayment: 'waiting_payment',
    paymentReceived: 'payment_received',
    itemDelivered: 'item_delivered',
    tradeCompleted: 'trade_completed',
    cancelled: 'cancelled'
  },

  // Status colors for embeds
  statusColors: {
    waiting_payment: 0xFFA500,    // Orange
    payment_received: 0x3498DB,   // Blue
    item_delivered: 0x9B59B6,     // Purple
    trade_completed: 0x2ECC71,    // Green
    cancelled: 0xE74C3C           // Red
  },

  // Status labels for display
  statusLabels: {
    waiting_payment: '⏳ Waiting for Payment',
    payment_received: '💰 Payment Received',
    item_delivered: '📦 Item Delivered',
    trade_completed: '✅ Trade Completed',
    cancelled: '❌ Trade Cancelled'
  }
};

// Validation function to check if required config is set
function validateMmConfig() {
  const required = ['mmRoleId', 'staffRoleId', 'logChannelId', 'mmCategoryId', 'transcriptChannelId'];
  const missing = required.filter(key => !mmConfig[key]);
  
  if (missing.length > 0) {
    console.warn(`⚠️  MM Config Warning: Missing required configuration keys: ${missing.join(', ')}`);
    console.warn('The middleman system may not work correctly without these values.');
    return false;
  }
  return true;
}

Object.freeze(mmConfig);

export default mmConfig;
export { validateMmConfig };