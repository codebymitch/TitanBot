# Discord Middleman Management System

A professional middleman ticket system for Discord servers where trades are managed by human middlemen, not automated bots.

## Features

- **Ticket System**: Create private tickets for each trade
- **Slash Commands**: `/mm`, `/close`, `/rep`
- **Interactive Buttons**: Status updates with one-click buttons
- **Status Management**: Track trade progress through 5 stages
- **Automatic Logs**: All actions are logged to a dedicated channel
- **Transcripts**: HTML transcripts generated when tickets close
- **Reputation System**: Track successful trades and user reputation
- **MongoDB Storage**: Persistent data storage

## Setup

### 1. Install Dependencies

```bash
npm install mongoose discord-html-transcripts
```

### 2. Configure Environment Variables

Add these to your `.env` file:

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/cbloxbot_mm

# Discord IDs (get these from your Discord server)
MM_ROLE_ID=123456789012345678    # Role for middlemen
STAFF_ROLE_ID=123456789012345678  # Role for staff/admins
LOG_CHANNEL_ID=123456789012345678 # Channel for action logs
MM_CATEGORY_ID=123456789012345678 # Category for ticket channels
TRANSCRIPT_CHANNEL_ID=123456789012345678 # Channel for transcripts

# Payment Information (optional, displayed in tickets)
PIX_KEY=your_pix_key_here
PAYPAL_EMAIL=your_paypal_email_here
```

### 3. Get Discord IDs

To get the required IDs:

1. Enable Developer Mode in Discord (User Settings > Advanced > Developer Mode)
2. Right-click on roles/channels and select "Copy ID"

### 4. Create Roles and Channels

1. **MM Role**: Create a role called "Middleman" and assign it to trusted staff
2. **Staff Role**: Create a role called "Staff" for administrators
3. **Log Channel**: Create a private channel for bot logs
4. **Transcript Channel**: Create a private channel for saved transcripts
5. **MM Category**: (Optional) Create a category for ticket channels

## Commands

### `/mm`
Opens a modal to create a new middleman trade ticket.

**Fields:**
- **Buyer**: User ID or @mention of the buyer
- **Seller**: User ID or @mention of the seller
- **Product**: Description of what's being traded
- **Value**: Trade value (e.g., "50 BRL", "$10 USD")

### `/close [status]`
Closes the current ticket and generates a transcript.

**Options:**
- `status`: Choose "Successful Trade" or "Cancelled Trade"

**Permissions:** Staff only

### `/rep <user> <type> [comment]`
Give reputation to a trader.

**Options:**
- `user`: The user to give reputation to
- `type`: Positive, Negative, or Neutral
- `comment`: Optional comment about the trade

## Button Functions

### Status Buttons
- **⏳ Waiting Payment**: Initial state
- **💰 Payment Received**: Buyer has paid the middleman
- **📦 Item Delivered**: Seller has delivered the product
- **✅ Trade Completed**: Trade finished successfully
- **❌ Cancel Trade**: Trade was cancelled

### Other Buttons
- **🛡️ Claim as Middleman**: Assign yourself as the middleman
- **📋 View Ticket Info**: Display ticket details
- **🔒 Close Ticket**: Close the ticket (Staff only)

## Ticket Permissions

Each ticket channel is private and only visible to:
- The buyer
- The seller
- Users with the MM role
- Users with the Staff role

## Data Storage

### Ticket Schema
```javascript
{
  channelId: String,      // Discord channel ID
  guildId: String,        // Server ID
  buyerId: String,        // Buyer's user ID
  sellerId: String,       // Seller's user ID
  middlemanId: String,    // Assigned middleman's ID
  product: String,        // What's being traded
  value: String,          // Trade value
  status: String,         // Current status
  createdAt: Date,        // When ticket was created
  closedAt: Date,         // When ticket was closed
  tradeSuccessful: Boolean // Was trade completed
}
```

### Reputation Schema
```javascript
{
  userId: String,         // User's ID
  guildId: String,        // Server ID
  successfulTrades: Number,
  cancelledTrades: Number,
  reps: [{
    givenBy: String,      // Who gave the rep
    type: String,         // positive/negative/neutral
    ticketId: String,     // Related ticket
    comment: String,      // Optional comment
    createdAt: Date
  }]
}
```

## Logs

The system automatically logs:
- Ticket creation
- Status changes
- Ticket closing
- Reputation changes
- Middleman assignments

All logs are sent to the configured log channel.

## Transcripts

When a ticket is closed:
1. An HTML transcript is generated
2. The transcript is saved to the transcript channel
3. The ticket channel is deleted
4. Reputation is updated based on trade outcome

## Troubleshooting

### MM System not working
1. Check that MongoDB is running
2. Verify all required environment variables are set
3. Check bot logs for connection errors

### Buttons not responding
1. Ensure the bot has proper permissions
2. Check that the MM role ID is correct
3. Verify MongoDB connection is active

### Commands not showing
1. Wait a few minutes for Discord to register slash commands
2. Try kicking and re-adding the bot
3. Ensure commands are registered in the correct guild

## Security Notes

- Keep your MongoDB connection string secure
- Never share your bot token
- Regularly backup your MongoDB database
- Review logs periodically for suspicious activity

## Support

For issues or questions, please open an issue on the GitHub repository.