// validation.js

import { logger } from './logger.js';

export function validateString(value: unknown, fieldName = 'string', maxLength = 2000): string | null {
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

export function validateNumber(value: unknown, fieldName = 'number'): number | null {
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

export function validateDiscordId(value: unknown, fieldName = 'ID'): string | null {
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

export function validateCustomId(value: unknown, fieldName = 'customId'): string | null {
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

export function validateRequiredProps(obj: unknown, requiredProps: string[], objName = 'object'): boolean {
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

export function validateUrl(value: unknown, fieldName = 'URL'): string | null {
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

export function validateRange(value: unknown, min: number, max: number, fieldName = 'value'): number | null {
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

export function validateEnum<T>(value: T, allowedValues: readonly T[], fieldName = 'value'): T | null {
  if (!allowedValues.includes(value)) {
    logger.warn(`[VALIDATION] ${fieldName} must be one of: ${allowedValues.join(', ')}`);
    return null;
  }
  
  return value;
}

export function sanitizeMarkdown(text: unknown): string {
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

export function sanitizeInput(input: unknown, maxLength = 2000): string {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '');
}

export function sanitizeMention(mention: string): string | null {
  const validId = mention.replace(/[<@!&#]/g, '');
  return /^\d+$/.test(validId) ? validId : null;
}

export function escapeHtml(text: unknown): string {
  if (typeof text !== 'string') return '';
  
  const map: Record<string, string> = {
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