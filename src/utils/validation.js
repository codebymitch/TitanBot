// validation.js

import { logger } from './logger.js';

export function validateString(value, fieldName = 'string', maxLength = 2000) {
  if (typeof value !== 'string') {
    logger.warn(`[VALIDATION] ${fieldName} must be a string, got ${typeof value}`);
    return null;
  }
  
  if (value.length === 0) {
    logger.warn(`[VALIDATION] ${fieldName} cannot be empty`);
    return null;
  }
  
  if (value.length > maxLength) {
    logger.warn(`[VALIDATION] ${fieldName} exceeds maximum length of ${maxLength}`);
    return value.substring(0, maxLength);
  }
  
  return value;
}

export function validateNumber(value, fieldName = 'number') {
  if (typeof value !== 'number' || isNaN(value)) {
    logger.warn(`[VALIDATION] ${fieldName} must be a valid number, got ${value}`);
    return null;
  }
  
  if (value < 0) {
    logger.warn(`[VALIDATION] ${fieldName} cannot be negative`);
    return null;
  }
  
  return value;
}

export function validateDiscordId(value, fieldName = 'ID') {
  if (typeof value !== 'string') {
    logger.warn(`[VALIDATION] ${fieldName} must be a string`);
    return null;
  }

  if (!/^\d{18,20}$/.test(value)) {
    logger.warn(`[VALIDATION] Invalid ${fieldName} format`);
    return null;
  }
  
  return value;
}

export function validateCustomId(value, fieldName = 'customId') {
  if (typeof value !== 'string' || value.length === 0) {
    logger.warn(`[VALIDATION] ${fieldName} must be a non-empty string`);
    return null;
  }
  
  if (value.length > 100) {
    logger.warn(`[VALIDATION] ${fieldName} exceeds maximum length of 100`);
    return null;
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    logger.warn(`[VALIDATION] ${fieldName} contains invalid characters`);
    return null;
  }
  
  return value;
}

export function validateRequiredProps(obj, requiredProps, objName = 'object') {
  if (!obj || typeof obj !== 'object') {
    logger.warn(`[VALIDATION] ${objName} must be an object`);
    return false;
  }
  
  const missing = requiredProps.filter(prop => !(prop in obj));
  
  if (missing.length > 0) {
    logger.warn(`[VALIDATION] ${objName} missing required properties: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

export function validateUrl(value, fieldName = 'URL') {
  if (typeof value !== 'string' || value.length === 0) {
    logger.warn(`[VALIDATION] ${fieldName} must be a non-empty string`);
    return null;
  }
  
  try {
    new URL(value);
    return value;
  } catch (error) {
    logger.warn(`[VALIDATION] ${fieldName} is not a valid URL`);
    return null;
  }
}

export function validateRange(value, min, max, fieldName = 'value') {
  if (typeof value !== 'number' || isNaN(value)) {
    logger.warn(`[VALIDATION] ${fieldName} must be a number`);
    return null;
  }
  
  if (value < min || value > max) {
    logger.warn(`[VALIDATION] ${fieldName} must be between ${min} and ${max}`);
    return null;
  }
  
  return value;
}

export function validateEnum(value, allowedValues, fieldName = 'value') {
  if (!allowedValues.includes(value)) {
    logger.warn(`[VALIDATION] ${fieldName} must be one of: ${allowedValues.join(', ')}`);
    return null;
  }
  
  return value;
}

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

export default {
  validateString,
  validateNumber,
  validateDiscordId,
  validateCustomId,
  validateRequiredProps,
  validateUrl,
  validateRange,
  validateEnum,
  sanitizeMarkdown,
  sanitizeInput,
  sanitizeMention,
  escapeHtml,
};