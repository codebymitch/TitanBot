/**
 * Sanitization utilities for preventing injection attacks
 */

/**
 * Sanitize markdown formatting to prevent injection
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeMarkdown(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/\*/g, '\\*')      // Escape bold
    .replace(/_/g, '\\_')       // Escape italic
    .replace(/`/g, '\\`')       // Escape code
    .replace(/\[/g, '\\[')      // Escape links
    .replace(/\]/g, '\\]')      // Escape links
    .replace(/\|/g, '\\|')      // Escape spoilers
    .replace(/~/g, '\\~');      // Escape strikethrough
}

/**
 * Sanitize user input for database storage
 * @param {string} input - User input
 * @param {number} maxLength - Maximum allowed length
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input, maxLength = 2000) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '');  // Remove control characters
}

/**
 * Validate and sanitize mention strings
 * @param {string} mention - Mention string to validate
 * @returns {string|null} Sanitized mention ID or null if invalid
 */
export function sanitizeMention(mention) {
  const validId = mention.replace(/[<@!&#]/g, '');
  return /^\d+$/.test(validId) ? validId : null;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, char => map[char]);
}
