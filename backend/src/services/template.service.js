/**
 * Message template rendering service
 * Handles variable replacement and template rotation
 */

/**
 * Get time-based Indonesian greeting
 * @param {Date} date - Optional date (default: now)
 * @returns {string} - Greeting text
 */
export function getGreeting(date = new Date()) {
  const timezone = process.env.TIMEZONE || null;
  let hour = date.getHours();

  // If timezone env var exists, adjust hour
  if (timezone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone
    });
    hour = parseInt(formatter.format(date));
  }

  if (hour >= 0 && hour < 11) return 'Selamat pagi';      // 00:00-10:59
  if (hour >= 11 && hour < 15) return 'Selamat siang';    // 11:00-14:59
  if (hour >= 15 && hour < 18) return 'Selamat sore';     // 15:00-17:59
  return 'Selamat malam';                                   // 18:00-23:59
}

/**
 * Render message template with contact data
 * Supports variables: {{name}}, {{phone}}, {{greeting}}, {{custom_field_name}}
 */
export function renderMessage(template, contact, variations = []) {
  // Select template (rotate based on contact ID for variation)
  const templates = [template, ...variations];
  const selectedTemplate = templates[
    Math.abs(hashCode(contact.id)) % templates.length
  ];

  let message = selectedTemplate;

  // Replace {{greeting}} first
  message = message.replace(/\{\{greeting\}\}/g, getGreeting());

  // Replace {{name}}
  message = message.replace(/\{\{name\}\}/g, contact.name || 'there');

  // Replace {{phone}}
  message = message.replace(/\{\{phone\}\}/g, contact.phone_number || '');

  // Replace custom fields
  if (contact.custom_fields && typeof contact.custom_fields === 'object') {
    for (const [key, value] of Object.entries(contact.custom_fields)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      message = message.replace(regex, value || '');
    }
  }

  // Clean up any remaining unreplaced variables (replace with empty string)
  message = message.replace(/\{\{[^}]+\}\}/g, '');

  return message.trim();
}

/**
 * Simple hash function for string (for template rotation)
 */
function hashCode(str) {
  let hash = 0;
  const strValue = String(str);
  for (let i = 0; i < strValue.length; i++) {
    const char = strValue.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Validate template for required variables
 */
export function validateTemplate(template) {
  if (!template || typeof template !== 'string') {
    return {
      valid: false,
      error: 'Template must be a non-empty string'
    };
  }

  // Extract all variables from template
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const variables = [];
  let match;

  while ((match = variableRegex.exec(template)) !== null) {
    variables.push(match[1]);
  }

  return {
    valid: true,
    variables,
    hasVariables: variables.length > 0,
    builtInVariables: ['name', 'phone', 'greeting']
  };
}

/**
 * Preview message with sample data
 */
export function previewMessage(template, sampleData = {}) {
  const defaultSample = {
    id: 'sample-id',
    name: 'John Doe',
    phone_number: '+628123456789',
    custom_fields: sampleData
  };

  return renderMessage(template, defaultSample);
}

export default {
  renderMessage,
  validateTemplate,
  previewMessage
};
