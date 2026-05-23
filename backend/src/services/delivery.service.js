import supabase from '../config/supabase.js';
import { messageQueue } from '../config/bull.js';
import logger from '../utils/logger.js';

/**
 * Smart Delivery Service
 * Handles intelligent contact distribution and message scheduling
 */

/**
 * Start campaign delivery
 * Main entry point for starting a blast campaign
 */
export async function startCampaign(campaignId) {
  try {
    logger.info('Starting campaign delivery', { campaignId });

    // 1. Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error('Campaign not found');
    }

    // 2. Get all pending contacts
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, phone_number, name, custom_fields')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (contactsError) {
      throw new Error('Failed to fetch contacts: ' + contactsError.message);
    }

    if (!contacts || contacts.length === 0) {
      throw new Error('No pending contacts found');
    }

    logger.info('Found pending contacts', {
      campaignId,
      count: contacts.length
    });

    // 3. Distribute contacts to sessions
    const distribution = await distributeContacts(contacts, campaign);

    logger.info('Contacts distributed', {
      campaignId,
      distributions: distribution.length
    });

    // 4. Schedule messages in queue
    await scheduleMessages(distribution, campaign);

    logger.info('Campaign delivery started', {
      campaignId,
      totalContacts: contacts.length,
      sessionsUsed: new Set(distribution.map(d => d.sessionId)).size
    });

    return {
      success: true,
      totalContacts: contacts.length,
      sessionsUsed: new Set(distribution.map(d => d.sessionId)).size
    };
  } catch (error) {
    logger.error('Failed to start campaign delivery', {
      campaignId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Distribute contacts across available sessions
 * Uses weighted round-robin based on health and quota
 */
export async function distributeContacts(contacts, campaign) {
  // Get available sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('waha_sessions')
    .select('id, phone_number, status, health_score, messages_sent_today, daily_quota')
    .in('id', campaign.sender_session_ids)
    .eq('status', 'connected')
    .neq('status', 'paused');

  if (sessionsError || !sessions || sessions.length === 0) {
    throw new Error('No available sessions found');
  }

  // Calculate remaining quota for each session
  const availableSessions = sessions.map(session => ({
    ...session,
    remaining_quota: Math.max(0, session.daily_quota - session.messages_sent_today)
  })).filter(s => s.remaining_quota > 0);

  if (availableSessions.length === 0) {
    throw new Error('All sessions have reached their daily quota');
  }

  // Sort by health score (best first), then by remaining quota (most first)
  availableSessions.sort((a, b) => {
    if (Math.abs(a.health_score - b.health_score) > 0.1) {
      return b.health_score - a.health_score; // Higher health first
    }
    return b.remaining_quota - a.remaining_quota; // More quota first
  });

  logger.info('Available sessions for distribution', {
    campaignId: campaign.id,
    sessions: availableSessions.map(s => ({
      phone: s.phone_number,
      health: s.health_score,
      remaining: s.remaining_quota
    }))
  });

  // Distribute contacts using round-robin
  const distribution = [];
  let sessionIndex = 0;
  const sessionQuotas = new Map(
    availableSessions.map(s => [s.id, s.remaining_quota])
  );

  for (const contact of contacts) {
    // Find next session with available quota
    let attempts = 0;
    let assigned = false;

    while (attempts < availableSessions.length && !assigned) {
      const session = availableSessions[sessionIndex];
      const remaining = sessionQuotas.get(session.id);

      if (remaining > 0) {
        // Assign contact to this session
        distribution.push({
          contactId: contact.id,
          sessionId: session.id,
          contact,
          session
        });

        // Decrement quota
        sessionQuotas.set(session.id, remaining - 1);
        assigned = true;
      }

      // Move to next session (round-robin)
      sessionIndex = (sessionIndex + 1) % availableSessions.length;
      attempts++;
    }

    if (!assigned) {
      // All sessions exhausted their quota
      logger.warn('Not enough quota to assign all contacts', {
        campaignId: campaign.id,
        remainingContacts: contacts.length - distribution.length
      });
      break;
    }
  }

  return distribution;
}

/**
 * Schedule messages in BullMQ with smart delays
 */
export async function scheduleMessages(distribution, campaign) {
  let scheduledTime = new Date();

  for (const item of distribution) {
    // Calculate smart delay
    const delaySeconds = calculateDelay(campaign, item.session, scheduledTime);

    // Add delay to scheduled time
    scheduledTime = new Date(scheduledTime.getTime() + delaySeconds * 1000);

    // Add job to BullMQ
    await messageQueue.add(
      'send-message',
      {
        contactId: item.contactId,
        sessionId: item.sessionId,
        campaignId: campaign.id
      },
      {
        delay: scheduledTime.getTime() - Date.now(),
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 60000 // Start with 1 minute
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 3600 // 24 hours
        },
        removeOnFail: false // Keep failed jobs for debugging
      }
    );

    // Update contact status to 'queued'
    await supabase
      .from('contacts')
      .update({
        status: 'queued',
        assigned_session_id: item.sessionId,
        queued_at: new Date().toISOString()
      })
      .eq('id', item.contactId);

    // Log to message_queue table
    await supabase
      .from('message_queue')
      .insert({
        contact_id: item.contactId,
        campaign_id: campaign.id,
        session_id: item.sessionId,
        job_id: `${campaign.id}-${item.contactId}`,
        scheduled_for: scheduledTime.toISOString(),
        delay_seconds: delaySeconds,
        status: 'pending'
      });

    logger.debug('Message scheduled', {
      contactId: item.contactId,
      sessionId: item.sessionId,
      scheduledFor: scheduledTime.toISOString(),
      delaySeconds
    });
  }

  logger.info('All messages scheduled', {
    campaignId: campaign.id,
    totalScheduled: distribution.length
  });
}

/**
 * Calculate smart delay for a message
 * Takes into account campaign settings, peak hours, and session health
 */
export function calculateDelay(campaign, session, currentTime = new Date()) {
  // Base delay: random between min and max
  const delayMin = campaign.delay_min || 20;
  const delayMax = campaign.delay_max || 90;
  let delay = randomInt(delayMin, delayMax);

  // Check if during peak hours
  if (campaign.avoid_peak_hours && isDuringPeakHours(campaign, currentTime)) {
    // Increase delay by 50% during peak hours
    delay = Math.floor(delay * 1.5);
    logger.debug('Peak hours detected, increasing delay', {
      originalDelay: delay / 1.5,
      newDelay: delay
    });
  }

  // Adjust based on session health
  if (session.health_score < 0.8) {
    // Slower sending for unhealthy sessions
    delay = Math.floor(delay * 1.3);
    logger.debug('Low health score, increasing delay', {
      healthScore: session.health_score,
      delay
    });
  }

  // Add jitter to avoid patterns (-5 to +5 seconds)
  const jitter = randomInt(-5, 5);
  delay += jitter;

  // Ensure minimum delay
  delay = Math.max(delayMin, delay);

  return delay;
}

/**
 * Check if current time is during peak hours
 */
function isDuringPeakHours(campaign, currentTime = new Date()) {
  if (!campaign.avoid_peak_hours) {
    return false;
  }

  const hour = currentTime.getHours();
  const minute = currentTime.getMinutes();
  const currentMinutes = hour * 60 + minute;

  // Parse peak hours (format: "HH:MM:SS")
  const peakStart = campaign.peak_hours_start || '09:00:00';
  const peakEnd = campaign.peak_hours_end || '17:00:00';

  const [startHour, startMinute] = peakStart.split(':').map(Number);
  const [endHour, endMinute] = peakEnd.split(':').map(Number);

  const peakStartMinutes = startHour * 60 + startMinute;
  const peakEndMinutes = endHour * 60 + endMinute;

  return currentMinutes >= peakStartMinutes && currentMinutes < peakEndMinutes;
}

/**
 * Generate random integer between min and max (inclusive)
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pause campaign delivery
 * Removes pending jobs from queue
 */
export async function pauseCampaign(campaignId) {
  try {
    logger.info('Pausing campaign delivery', { campaignId });

    // Get all queued jobs for this campaign
    const jobs = await messageQueue.getJobs(['waiting', 'delayed']);

    let removedCount = 0;
    for (const job of jobs) {
      if (job.data.campaignId === campaignId) {
        await job.remove();
        removedCount++;
      }
    }

    logger.info('Campaign delivery paused', {
      campaignId,
      jobsRemoved: removedCount
    });

    return { removedCount };
  } catch (error) {
    logger.error('Failed to pause campaign delivery', {
      campaignId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Resume campaign delivery
 * Re-schedules all queued contacts
 */
export async function resumeCampaign(campaignId) {
  try {
    logger.info('Resuming campaign delivery', { campaignId });

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      throw new Error('Campaign not found');
    }

    // Get all queued contacts (that haven't been sent yet)
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, phone_number, name, custom_fields, assigned_session_id')
      .eq('campaign_id', campaignId)
      .eq('status', 'queued');

    if (contactsError) {
      throw new Error('Failed to fetch queued contacts: ' + contactsError.message);
    }

    if (!contacts || contacts.length === 0) {
      logger.info('No queued contacts to resume', { campaignId });
      return { rescheduledCount: 0 };
    }

    // Get sessions
    const { data: sessions } = await supabase
      .from('waha_sessions')
      .select('*')
      .in('id', campaign.sender_session_ids);

    const sessionMap = new Map(sessions.map(s => [s.id, s]));

    // Create distribution from existing assignments
    const distribution = contacts.map(contact => ({
      contactId: contact.id,
      sessionId: contact.assigned_session_id,
      contact,
      session: sessionMap.get(contact.assigned_session_id)
    }));

    // Re-schedule messages
    await scheduleMessages(distribution, campaign);

    logger.info('Campaign delivery resumed', {
      campaignId,
      rescheduledCount: distribution.length
    });

    return { rescheduledCount: distribution.length };
  } catch (error) {
    logger.error('Failed to resume campaign delivery', {
      campaignId,
      error: error.message
    });
    throw error;
  }
}

export default {
  startCampaign,
  distributeContacts,
  scheduleMessages,
  calculateDelay,
  pauseCampaign,
  resumeCampaign
};
