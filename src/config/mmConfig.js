/**
 * Middleman System Configuration (Database-Free)
 * 
 * This configuration file contains the settings for the Discord Middleman system.
 * All trade state is stored in channel topics, no database required.
 * 
 * Replace the placeholder IDs with actual Discord IDs from your server.
 */

const mmConfig = {
  // Discord Role IDs (REQUIRED)
  mmRoleId: process.env.MM_ROLE_ID || '',        // Role that can be pinged for MM requests
  staffRoleId: process.env.STAFF_ROLE_ID || '',  // Role that can claim/close tickets

  // Channel IDs (OPTIONAL)
  mmCategoryId: process.env.MM_CATEGORY_ID || '', // Category for MM channels (auto-created if not set)

  // Ticket Settings
  ticketNamePrefix: 'mm',
  
  // Status labels for display (PT-BR)
  statusLabels: {
    PENDING: '⏳ AGUARDANDO MIDDLEMAN',
    NOTIFIED: '⏳ SUPORTE NOTIFICADO',
    IN_PROGRESS: '🟢 EM ANDAMENTO',
    DELIVERED: '✅ ENTREGUE / AGUARDANDO MM',
    COMPLETED: '✅ INTERMEDIAÇÃO CONCLUÍDA',
    CANCELLED: '❌ INTERMEDIAÇÃO CANCELADA'
  },

  // Status colors for embeds
  statusColors: {
    PENDING: 0x3498DB,      // Blue
    NOTIFIED: 0xF39C12,     // Orange
    IN_PROGRESS: 0x2ECC71,  // Green
    DELIVERED: 0x1ABC9C,    // Turquoise
    COMPLETED: 0x27AE60,    // Dark Green
    CANCELLED: 0xE74C3C     // Red
  }
};

// Validation function to check if required config is set
function validateMmConfig() {
  const required = ['mmRoleId', 'staffRoleId'];
  const missing = required.filter(key => !mmConfig[key]);
  
  if (missing.length > 0) {
    console.warn('⚠️  MM Config Warning: Missing required configuration keys: ' + missing.join(', '));
    console.warn('Set MM_ROLE_ID and STAFF_ROLE_ID in your .env file.');
    return false;
  }
  return true;
}

Object.freeze(mmConfig);

export default mmConfig;
export { validateMmConfig };