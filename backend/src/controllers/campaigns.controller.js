import supabase from '../config/supabase.js';
import {
  validateCampaign,
  canStartCampaign,
  getCampaignStats,
  pauseCampaign,
  resumeCampaign,
  estimateCampaignDuration
} from '../services/campaign.service.js';
import {
  startCampaign as startDelivery,
  pauseCampaign as pauseDelivery,
  resumeCampaign as resumeDelivery
} from '../services/delivery.service.js';
import { sendCampaignStartReport } from '../services/report.service.js';
import logger from '../utils/logger.js';

/**
 * Get all campaigns
 */
export async function getAllCampaigns(req, res) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('campaigns')
      .select('*, contacts(count)', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      query = query.eq('status', status);
    }

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      logger.error('Failed to fetch campaigns', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch campaigns'
      });
    }

    res.json({
      campaigns: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Get campaigns error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaigns'
    });
  }
}

/**
 * Get single campaign
 */
export async function getCampaign(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found'
      });
    }

    // Get session details
    if (data.sender_session_ids && data.sender_session_ids.length > 0) {
      const { data: sessions } = await supabase
        .from('waha_sessions')
        .select('id, session_name, phone_number, status, health_score')
        .in('id', data.sender_session_ids);

      data.sender_sessions = sessions || [];
    }

    res.json({ campaign: data });
  } catch (error) {
    logger.error('Get campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign'
    });
  }
}

/**
 * Create new campaign
 */
export async function createCampaign(req, res) {
  try {
    const {
      name,
      description,
      message_template,
      message_variations,
      attachment_url,
      delay_min,
      delay_max,
      avoid_peak_hours,
      peak_hours_start,
      peak_hours_end,
      sender_session_ids,
      scheduled_for
    } = req.body;

    // Validate campaign data
    const validation = await validateCampaign({
      name,
      message_template,
      delay_min,
      delay_max,
      sender_session_ids
    });

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Validation failed',
        errors: validation.errors
      });
    }

    // Create campaign
    const { data, error } = await supabase
      .from('campaigns')
      .insert([{
        name: name.trim(),
        description: description?.trim() || null,
        message_template: message_template.trim(),
        message_variations: message_variations || [],
        attachment_url: attachment_url || null,
        delay_min: delay_min || 20,
        delay_max: delay_max || 90,
        avoid_peak_hours: avoid_peak_hours !== undefined ? avoid_peak_hours : true,
        peak_hours_start: peak_hours_start || '09:00:00',
        peak_hours_end: peak_hours_end || '17:00:00',
        sender_session_ids,
        status: scheduled_for ? 'scheduled' : 'draft',
        scheduled_for: scheduled_for || null,
        created_by: req.user.id
      }])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create campaign', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create campaign'
      });
    }

    logger.info('Campaign created', {
      campaignId: data.id,
      name: data.name,
      userId: req.user.id
    });

    res.status(201).json({
      campaign: data,
      message: 'Campaign created successfully'
    });
  } catch (error) {
    logger.error('Create campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create campaign'
    });
  }
}

/**
 * Update campaign
 */
export async function updateCampaign(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check if campaign exists and is editable
    const { data: existing, error: fetchError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found'
      });
    }

    // Don't allow editing active or completed campaigns
    if (existing.status === 'active') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot edit an active campaign. Pause it first.'
      });
    }

    if (existing.status === 'completed') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot edit a completed campaign'
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;
    delete updates.total_contacts;
    delete updates.sent_count;
    delete updates.failed_count;
    delete updates.queued_count;
    delete updates.started_at;
    delete updates.completed_at;

    // Validate if critical fields are being updated
    if (updates.message_template || updates.sender_session_ids || updates.delay_min || updates.delay_max) {
      const validation = await validateCampaign({
        name: updates.name || existing.name,
        message_template: updates.message_template || existing.message_template,
        delay_min: updates.delay_min !== undefined ? updates.delay_min : existing.delay_min,
        delay_max: updates.delay_max !== undefined ? updates.delay_max : existing.delay_max,
        sender_session_ids: updates.sender_session_ids || existing.sender_session_ids
      });

      if (!validation.valid) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Validation failed',
          errors: validation.errors
        });
      }
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to update campaign', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to update campaign'
      });
    }

    logger.info('Campaign updated', { campaignId: id });

    res.json({
      campaign: data,
      message: 'Campaign updated successfully'
    });
  } catch (error) {
    logger.error('Update campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update campaign'
    });
  }
}

/**
 * Delete campaign
 */
export async function deleteCampaign(req, res) {
  try {
    const { id } = req.params;

    // Check if campaign exists and can be deleted
    const { data: existing, error: fetchError } = await supabase
      .from('campaigns')
      .select('status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Campaign not found'
      });
    }

    // Don't allow deleting active campaigns
    if (existing.status === 'active') {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot delete an active campaign. Pause or cancel it first.'
      });
    }

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete campaign', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete campaign'
      });
    }

    logger.info('Campaign deleted', { campaignId: id });

    res.json({
      message: 'Campaign deleted successfully'
    });
  } catch (error) {
    logger.error('Delete campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete campaign'
    });
  }
}

/**
 * Start campaign
 */
export async function startCampaign(req, res) {
  try {
    const { id } = req.params;

    // Check if campaign can be started
    const canStart = await canStartCampaign(id);

    if (!canStart.canStart) {
      return res.status(400).json({
        error: 'Bad Request',
        message: canStart.reason
      });
    }

    // Update campaign status
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        status: 'active',
        started_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('Failed to start campaign', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to start campaign'
      });
    }

    logger.info('Campaign started', {
      campaignId: id,
      contactCount: canStart.contactCount,
      sessionsAvailable: canStart.availableSessions
    });

    // Estimate duration
    const estimate = estimateCampaignDuration(
      canStart.contactCount,
      canStart.availableSessions
    );

    // Start delivery service (async - don't wait)
    startDelivery(id).catch(error => {
      logger.error('Failed to start delivery service', {
        campaignId: id,
        error: error.message
      });
    });

    // Send campaign start report to admin (async - don't wait)
    sendCampaignStartReport(id).catch(error => {
      logger.error('Failed to send campaign start report', {
        campaignId: id,
        error: error.message
      });
    });

    res.json({
      campaign: data,
      message: 'Campaign started successfully',
      stats: {
        total_contacts: canStart.contactCount,
        available_sessions: canStart.availableSessions,
        estimated_duration: estimate
      }
    });
  } catch (error) {
    logger.error('Start campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to start campaign'
    });
  }
}

/**
 * Pause campaign
 */
export async function pauseCampaignHandler(req, res) {
  try {
    const { id } = req.params;

    const data = await pauseCampaign(id);

    // Pause delivery (remove jobs from queue)
    pauseDelivery(id).catch(error => {
      logger.error('Failed to pause delivery', {
        campaignId: id,
        error: error.message
      });
    });

    res.json({
      campaign: data,
      message: 'Campaign paused successfully'
    });
  } catch (error) {
    logger.error('Pause campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}

/**
 * Resume campaign
 */
export async function resumeCampaignHandler(req, res) {
  try {
    const { id } = req.params;

    const data = await resumeCampaign(id);

    // Resume delivery (re-schedule queued messages)
    resumeDelivery(id).catch(error => {
      logger.error('Failed to resume delivery', {
        campaignId: id,
        error: error.message
      });
    });

    res.json({
      campaign: data,
      message: 'Campaign resumed successfully'
    });
  } catch (error) {
    logger.error('Resume campaign error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message
    });
  }
}

/**
 * Get campaign statistics
 */
export async function getCampaignStatsHandler(req, res) {
  try {
    const { id } = req.params;

    const stats = await getCampaignStats(id);

    res.json({ stats });
  } catch (error) {
    logger.error('Get campaign stats error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaign statistics'
    });
  }
}

/**
 * Upload campaign attachment
 * POST /api/campaigns/attachments/upload
 */
export async function uploadAttachment(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file provided'
      });
    }

    const { buffer, originalname, mimetype, size } = req.file;

    logger.info('Uploading attachment', {
      filename: originalname,
      mimetype,
      size,
      userId: req.user.id
    });

    // Upload to Supabase Storage
    const { uploadCampaignAttachment } = await import('../services/storage.service.js');
    const publicUrl = await uploadCampaignAttachment(buffer, originalname, mimetype);

    res.status(200).json({
      url: publicUrl,
      filename: originalname,
      size,
      mimeType: mimetype
    });
  } catch (error) {
    logger.error('Attachment upload failed', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to upload attachment'
    });
  }
}

export default {
  getAllCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaignHandler,
  resumeCampaignHandler,
  getCampaignStatsHandler,
  uploadAttachment
};
