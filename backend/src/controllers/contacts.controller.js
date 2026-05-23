import supabase from '../config/supabase.js';
import { parseCSV } from '../utils/csvParser.js';
import logger from '../utils/logger.js';

/**
 * Get all contacts for a campaign
 */
export async function getContacts(req, res) {
  try {
    const { id: campaignId } = req.params;
    const { status, limit = 100, offset = 0 } = req.query;

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found'
      });
    }

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch contacts', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch contacts'
      });
    }

    res.json({
      contacts: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Get contacts error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch contacts'
    });
  }
}

/**
 * Get single contact
 */
export async function getContact(req, res) {
  try {
    const { id: campaignId, contactId } = req.params;

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .eq('campaign_id', campaignId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Contact not found'
      });
    }

    res.json({ contact: data });
  } catch (error) {
    logger.error('Get contact error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch contact'
    });
  }
}

/**
 * Import contacts from CSV
 */
export async function importContacts(req, res) {
  try {
    const { id: campaignId } = req.params;

    // Get CSV content from either file upload or body
    let csvContent;

    if (req.file) {
      // File uploaded via multipart/form-data
      csvContent = req.file.buffer.toString('utf-8');
    } else if (req.body.csvContent) {
      // CSV content sent as string
      csvContent = req.body.csvContent;
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'CSV file or content is required'
      });
    }

    // Verify campaign exists and is editable
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found'
      });
    }

    // Don't allow importing to active or completed campaigns
    if (campaign.status === 'active') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot import contacts to an active campaign. Pause it first.'
      });
    }

    if (campaign.status === 'completed') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot import contacts to a completed campaign'
      });
    }

    // Parse CSV
    const parseResult = parseCSV(csvContent);

    if (parseResult.contacts.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No valid contacts found in CSV',
        errors: parseResult.errors,
        summary: parseResult.summary
      });
    }

    // Prepare contacts for insertion
    const contactsToInsert = parseResult.contacts.map(contact => ({
      campaign_id: campaignId,
      phone_number: contact.phone_number,
      name: contact.name || '',
      custom_fields: contact.custom_fields,
      status: 'pending'
    }));

    // Insert contacts in batches (Supabase has a limit)
    const batchSize = 500;
    const batches = [];
    for (let i = 0; i < contactsToInsert.length; i += batchSize) {
      batches.push(contactsToInsert.slice(i, i + batchSize));
    }

    let insertedCount = 0;
    const insertErrors = [];

    for (const batch of batches) {
      const { data, error } = await supabase
        .from('contacts')
        .insert(batch)
        .select('id');

      if (error) {
        insertErrors.push(error.message);
        logger.error('Failed to insert contact batch', { error });
      } else {
        insertedCount += data.length;
      }
    }

    // Update campaign total_contacts
    await supabase
      .from('campaigns')
      .update({
        total_contacts: insertedCount
      })
      .eq('id', campaignId);

    logger.info('Contacts imported', {
      campaignId,
      total: parseResult.contacts.length,
      inserted: insertedCount,
      invalid: parseResult.errors.length
    });

    res.status(201).json({
      message: 'Contacts imported successfully',
      summary: {
        total_in_csv: parseResult.summary.total,
        valid: parseResult.summary.valid,
        invalid: parseResult.summary.invalid,
        inserted: insertedCount
      },
      errors: parseResult.errors.length > 0 ? parseResult.errors : undefined,
      insert_errors: insertErrors.length > 0 ? insertErrors : undefined
    });
  } catch (error) {
    logger.error('Import contacts error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to import contacts: ' + error.message
    });
  }
}

/**
 * Delete contact
 */
export async function deleteContact(req, res) {
  try {
    const { id: campaignId, contactId } = req.params;

    // Verify contact belongs to campaign
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('status')
      .eq('id', contactId)
      .eq('campaign_id', campaignId)
      .single();

    if (fetchError || !contact) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Contact not found'
      });
    }

    // Don't allow deleting contacts that are being sent or already sent
    if (contact.status === 'sending' || contact.status === 'sent') {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Cannot delete contact with status: ${contact.status}`
      });
    }

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', contactId);

    if (error) {
      logger.error('Failed to delete contact', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete contact'
      });
    }

    logger.info('Contact deleted', { campaignId, contactId });

    res.json({
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    logger.error('Delete contact error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete contact'
    });
  }
}

/**
 * Delete all contacts from campaign
 */
export async function deleteAllContacts(req, res) {
  try {
    const { campaignId } = req.params;

    // Verify campaign exists
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found'
      });
    }

    // Don't allow deleting from active campaigns
    if (campaign.status === 'active') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot delete contacts from an active campaign. Pause it first.'
      });
    }

    // Delete only pending and failed contacts
    const { data, error } = await supabase
      .from('contacts')
      .delete()
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'failed'])
      .select('id');

    if (error) {
      logger.error('Failed to delete contacts', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete contacts'
      });
    }

    logger.info('Contacts deleted', { campaignId, count: data.length });

    res.json({
      message: 'Contacts deleted successfully',
      deleted_count: data.length
    });
  } catch (error) {
    logger.error('Delete all contacts error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete contacts'
    });
  }
}

export default {
  getContacts,
  getContact,
  importContacts,
  deleteContact,
  deleteAllContacts
};
