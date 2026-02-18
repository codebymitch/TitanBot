/**
 * Sanitization utilities for preventing injection attacks
 * 
 * SECURITY NOTES:
 * - These functions provide basic protection against common injection attacks
 * - sanitizeMarkdown: Prevents Discord markdown exploitation
 * - sanitizeInput: Removes control characters and enforces length limits
 * - sanitizeMention: Validates Discord mention format
 * - escapeHtml: Prevents XSS when displaying user-provided HTML
 * 
 * WARNING: These functions should always be used for any user-provided input
 * that will be displayed publicly or stored in the database.
 */
















export function sanitizeMarkdown(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/\*/g, '\\*')      
    .replace(/_/g, '\\_')       
    .replace(/`/g, '\\`')       
    .replace(/\[/g, '\\[')      
    .replace(/\]/g, '\\]')      
    .replace(/\|/g, '\\|')      
    .replace(/~/g, '\\~');      
}

/**
 * Sanitize user input for database storage
 * Removes:
 * - Leading/trailing whitespace
 * - Control characters (ASCII 0x00-0x1F and 0x7F)
 * - Enforces maximum length to prevent buffer overflow attacks
 * 
 * @param {string} input - User input to sanitize
 * @param {number} maxLength - Maximum allowed length (default: 2000)
 * @returns {string} Sanitized input safe for database storage
 * @example
 * sanitizeInput('hello\\x00world', 10) // Returns 'hello'
 */
export function sanitizeInput(input, maxLength = 2000) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '');  
}













export function sanitizeMention(mention) {
  const validId = mention.replace(/[<@!&#]/g, '');
  return /^\d+$/.test(validId) ? validId : null;
}
















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
