/**
 * Format phone number for WAHA API
 * Input: +628123456789 or 628123456789 or 08123456789
 * Output: 628123456789@c.us
 */
export function formatPhoneForWAHA(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }

  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');

  // If starts with 0, replace with country code (62 for Indonesia)
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }

  // Ensure it doesn't start with + (already removed above)
  // Add WhatsApp suffix
  return `${cleaned}@c.us`;
}

/**
 * Validate phone number format
 * Must be E.164 format or local format starting with 0
 */
export function validatePhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    return { valid: false, error: 'Phone number is required' };
  }

  // Remove whitespace
  const cleaned = phoneNumber.trim();

  // Check if it's a valid format
  // E.164: +628123456789 (8-15 digits after country code)
  // Local: 08123456789 (starts with 0)
  const e164Pattern = /^\+?[1-9]\d{7,14}$/;
  const localPattern = /^0\d{8,14}$/;

  if (e164Pattern.test(cleaned) || localPattern.test(cleaned)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Invalid phone number format. Use E.164 (+628xxx) or local (08xxx)'
  };
}

/**
 * Normalize phone number to E.164 format for storage
 * Output: +628123456789
 */
export function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number is required');
  }

  // Remove all non-digit characters except leading +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // If starts with 0, replace with country code
  if (cleaned.startsWith('0')) {
    cleaned = '+62' + cleaned.substring(1);
  }

  // Ensure it starts with +
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

export default {
  formatPhoneForWAHA,
  validatePhoneNumber,
  normalizePhoneNumber
};
