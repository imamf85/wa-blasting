import supabase from '../config/supabase.js';
import { validateTemplate } from './template.service.js';
import logger from '../utils/logger.js';

/**
 * Campaign Service
 * Business logic for campaign operations
 */

/**
 * Validate campaign before creation/update
 */
export async function validateCampaign(campaignData) {
  const errors = [];

  // Validate name
  if (!campaignData.name || campaignData.name.trim().length === 0) {
    errors.push('Campaign name is required');
  }

  // Validate message template
  if (!campaignData.message_template || campaignData.message_template.trim().length === 0) {
    errors.push('Message template is required');
  } else {
    const templateValidation = validateTemplate(campaignData.message_template);
    if (!templateValidation.valid) {
      errors.push(templateValidation.error);
    }
  }

  // Validate delays
  if (campaignData.delay_min !== undefined && campaignData.delay_min < 10) {
    errors.push('Minimum delay must be at least 10 seconds');
  }

  if (campaignData.delay_max !== undefined && campaignData.delay_min !== undefined) {
    if (campaignData.delay_max < campaignData.delay_min) {
      errors.push('Maximum delay must be greater than minimum delay');
    }
  }

  // Validate sender sessions
  if (!campaignData.sender_session_ids || campaignData.sender_session_ids.length === 0) {
    errors.push('At least one sender session is required');
  } else {
    // Verify all sessions exist and are connected
    const { data: sessions, error } = await supabase
      .from('waha_sessions')
      .select('id, status, phone_number')
      .in('id', campaignData.sender_session_ids);

    if (error) {
      errors.push('Failed to verify sender sessions');
    } else if (sessions.length !== campaignData.sender_session_ids.length) {
      errors.push('Some sender sessions do not exist');
    } else {
      // Check if sessions are connected
      const disconnectedSessions = sessions.filter(s => s.status !== 'connected');
      if (disconnectedSessions.length > 0) {
        errors.push(`Some sessions are not connected: ${disconnectedSessions.map(s => s.phone_number).join(', ')}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check if campaign can be started
 */
export async function canStartCampaign(campaignId) {
  // Get campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*, contacts(count)')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    return {
      canStart: false,
      reason: 'Campaign not found'
    };
  }

  // Check campaign status
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    return {
      canStart: false,
      reason: `Campaign is already ${campaign.status}`
    };
  }

  // Check if there are contacts
  const { count: contactCount } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (contactCount === 0) {
    return {
      canStart: false,
      reason: 'No contacts in campaign. Please import contacts first.'
    };
  }

  // Check if sender sessions are still available
  const { data: sessions, error: sessionsError } = await supabase
    .from('waha_sessions')
    .select('id, status, phone_number')
    .in('id', campaign.sender_session_ids);

  if (sessionsError || sessions.length === 0) {
    return {
      canStart: false,
      reason: 'No sender sessions available'
    };
  }

  const availableSessions = sessions.filter(s =>
    s.status === 'connected' &&
    s.status !== 'paused'
  );

  if (availableSessions.length === 0) {
    return {
      canStart: false,
      reason: 'No sender sessions are connected and available'
    };
  }

  return {
    canStart: true,
    contactCount,
    availableSessions: availableSessions.length
  };
}

/**
 * Get campaign statistics
 */
export async function getCampaignStats(campaignId) {
  // Get campaign
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (error || !campaign) {
    throw new Error('Campaign not found');
  }

  // Get contacts separately to avoid RLS issues with nested queries
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('status')
    .eq('campaign_id', campaignId);

  console.log('DEBUG getCampaignStats:', {
    campaignId,
    contactsCount: contacts?.length || 0,
    contactsError: contactsError?.message || null,
    campaignTotalContacts: campaign.total_contacts
  });

  if (contactsError) {
    console.error('Error fetching contacts:', contactsError);
    // Return stats with 0 counts if can't fetch contacts
    return {
      campaign_id: campaignId,
      campaign_name: campaign.name,
      status: campaign.status,
      total: campaign.total_contacts || 0,
      sent: 0,
      failed: 0,
      queued: 0,
      pending: campaign.total_contacts || 0,
      success_rate: 0,
      progress: 0,
      started_at: campaign.started_at,
      completed_at: campaign.completed_at,
      duration: null
    };
  }

  // Count by status
  const statusCounts = (contacts || []).reduce((acc, contact) => {
    acc[contact.status] = (acc[contact.status] || 0) + 1;
    return acc;
  }, {});

  const total = contacts?.length || campaign.total_contacts || 0;
  const sent = statusCounts.sent || 0;
  const failed = statusCounts.failed || 0;
  const queued = (statusCounts.queued || 0) + (statusCounts.sending || 0);
  const pending = statusCounts.pending || 0;

  const successRate = total > 0 ? (sent / (sent + failed || 1) * 100) : 0;
  const progress = total > 0 ? ((sent + failed) / total * 100) : 0;

  return {
    campaign_id: campaignId,
    campaign_name: campaign.name,
    status: campaign.status,
    total,
    sent,
    failed,
    queued,
    pending,
    success_rate: parseFloat(successRate.toFixed(2)),
    progress: parseFloat(progress.toFixed(2)),
    started_at: campaign.started_at,
    completed_at: campaign.completed_at,
    duration: campaign.started_at && campaign.completed_at
      ? Math.round((new Date(campaign.completed_at) - new Date(campaign.started_at)) / 1000)
      : null
  };
}

/**
 * Pause campaign
 */
export async function pauseCampaign(campaignId) {
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      status: 'paused',
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    throw new Error('Failed to pause campaign: ' + error.message);
  }

  logger.info('Campaign paused', { campaignId });

  return data;
}

/**
 * Resume campaign
 */
export async function resumeCampaign(campaignId) {
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    throw new Error('Failed to resume campaign: ' + error.message);
  }

  logger.info('Campaign resumed', { campaignId });

  return data;
}

/**
 * Complete campaign
 */
export async function completeCampaign(campaignId) {
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', campaignId)
    .select()
    .single();

  if (error) {
    throw new Error('Failed to complete campaign: ' + error.message);
  }

  logger.info('Campaign completed', { campaignId });

  return data;
}

/**
 * Estimate campaign duration
 */
export function estimateCampaignDuration(contactCount, sessionCount, avgDelay = 55) {
  // avgDelay in seconds (default: 55 = middle of 20-90 range)
  const totalSeconds = (contactCount / sessionCount) * avgDelay;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return {
    total_seconds: Math.round(totalSeconds),
    hours,
    minutes,
    human_readable: hours > 0
      ? `${hours}h ${minutes}m`
      : `${minutes}m`
  };
}

export default {
  validateCampaign,
  canStartCampaign,
  getCampaignStats,
  pauseCampaign,
  resumeCampaign,
  completeCampaign,
  estimateCampaignDuration
};
