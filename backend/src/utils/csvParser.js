import { validatePhoneNumber, normalizePhoneNumber } from './phoneFormatter.js';

/**
 * Parse CSV content and extract contacts
 * Expected format: phone_number,name,custom_field1,custom_field2,...
 * First row should be headers
 */
export function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV must contain at least header row and one data row');
  }

  // Parse headers
  const headers = lines[0].split(',').map(h => h.trim());

  // Validate required columns
  if (!headers.includes('phone_number')) {
    throw new Error('CSV must contain "phone_number" column');
  }

  const phoneIndex = headers.indexOf('phone_number');
  const nameIndex = headers.indexOf('name');

  // Get custom field headers (all except phone_number and name)
  const customFieldHeaders = headers.filter(h => h !== 'phone_number' && h !== 'name');

  const contacts = [];
  const errors = [];

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = line.split(',').map(v => v.trim());

    const phoneNumber = values[phoneIndex];

    // Validate phone number
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.valid) {
      errors.push({
        row: i + 1,
        phone: phoneNumber,
        error: validation.error
      });
      continue;
    }

    // Extract custom fields
    const customFields = {};
    customFieldHeaders.forEach(header => {
      const index = headers.indexOf(header);
      if (index !== -1 && values[index]) {
        customFields[header] = values[index];
      }
    });

    contacts.push({
      phone_number: normalizePhoneNumber(phoneNumber),
      name: nameIndex !== -1 ? values[nameIndex] : '',
      custom_fields: customFields
    });
  }

  return {
    contacts,
    errors,
    summary: {
      total: lines.length - 1,
      valid: contacts.length,
      invalid: errors.length
    }
  };
}

/**
 * Validate CSV file before processing
 */
export function validateCSVFormat(csvContent) {
  try {
    const lines = csvContent.trim().split('\n');

    if (lines.length < 2) {
      return {
        valid: false,
        error: 'CSV must contain at least header row and one data row'
      };
    }

    const headers = lines[0].split(',').map(h => h.trim());

    if (!headers.includes('phone_number')) {
      return {
        valid: false,
        error: 'CSV must contain "phone_number" column'
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid CSV format: ' + error.message
    };
  }
}

export default {
  parseCSV,
  validateCSVFormat
};
