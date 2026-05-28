import supabase from '../config/supabase.js';
import WAHAService from './waha.service.js';
import { broadcast } from '../websocket/sse.js';
import { sendSessionPauseAlert } from './report.service.js';
import logger from '../utils/logger.js';

/**
 * Health Monitoring Service
 * Monitors session health and auto-pauses unhealthy sessions
 */

/**
 * Check health of a single session
 */
export async function checkSessionHealth(sessionId) {
  try {
    logger.debug('Checking session health', { sessionId });

    // Get session data
    const { data: session, error: sessionError } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      logger.error('Session not found', { sessionId });
      return null;
    }

    // Calculate health score based on recent delivery logs
    const healthScore = await calculateHealthScore(sessionId);

    // Get error threshold from settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'error_threshold_per_hour')
      .single();

    const errorThreshold = settings ? parseInt(settings.value) : 10;

    // Check if session should be auto-paused
    let shouldPause = false;
    let pauseReason = '';

    // Check 1: Health score too low (< 50%)
    if (healthScore < 0.5) {
      shouldPause = true;
      pauseReason = `Auto-paused: Low health score (${(healthScore * 100).toFixed(1)}%)`;
      logger.warn('Low health score detected', {
        sessionId,
        phone: session.phone_number,
        healthScore
      });
    }

    // Check 2: Too many errors in last hour
    const recentErrors = await getRecentErrorCount(sessionId);
    if (recentErrors > errorThreshold) {
      shouldPause = true;
      pauseReason = `Auto-paused: High error rate (${recentErrors} errors in last hour)`;
      logger.warn('High error rate detected', {
        sessionId,
        phone: session.phone_number,
        errorCount: recentErrors
      });
    }

    // Check 3: Daily error count exceeds threshold
    if (session.error_count_today > errorThreshold * 2) {
      shouldPause = true;
      pauseReason = `Auto-paused: Daily error limit exceeded (${session.error_count_today} errors today)`;
      logger.warn('Daily error limit exceeded', {
        sessionId,
        phone: session.phone_number,
        errorCount: session.error_count_today
      });
    }

    // Auto-pause if needed
    if (shouldPause && session.status === 'connected') {
      await pauseUnhealthySession(sessionId, pauseReason);

      // Redistribute pending messages from this session
      await redistributePendingMessages(sessionId);

      // TODO: Phase 8 - Send admin alert
      logger.info('Session auto-paused and admin should be notified', {
        sessionId,
        phone: session.phone_number,
        reason: pauseReason
      });
    }

    // Update health score in database
    await supabase
      .from('waha_sessions')
      .update({
        health_score: healthScore,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    logger.debug('Health check complete', {
      sessionId,
      healthScore,
      shouldPause
    });

    return {
      sessionId,
      healthScore,
      recentErrors,
      shouldPause,
      pauseReason
    };
  } catch (error) {
    logger.error('Failed to check session health', {
      sessionId,
      error: error.message
    });
    return null;
  }
}

/**
 * Calculate health score based on delivery success rate
 * Returns value between 0.0 (very unhealthy) and 1.0 (perfect health)
 */
export async function calculateHealthScore(sessionId) {
  try {
    // Look at last 1 hour of delivery logs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { data: logs, error } = await supabase
      .from('delivery_logs')
      .select('event_type')
      .eq('session_id', sessionId)
      .gte('timestamp', oneHourAgo.toISOString());

    if (error) {
      logger.error('Failed to fetch delivery logs', { sessionId, error });
      return 1.0; // Default to healthy if can't calculate
    }

    if (!logs || logs.length === 0) {
      // No recent activity - keep current health or default to healthy
      return 1.0;
    }

    // Count successes and failures
    const successCount = logs.filter(log => log.event_type === 'sent').length;
    const failCount = logs.filter(log => log.event_type === 'failed').length;
    const total = successCount + failCount;

    if (total === 0) {
      return 1.0; // No completed attempts
    }

    // Calculate success rate
    const healthScore = successCount / total;

    logger.debug('Health score calculated', {
      sessionId,
      successCount,
      failCount,
      total,
      healthScore
    });

    return healthScore;
  } catch (error) {
    logger.error('Failed to calculate health score', {
      sessionId,
      error: error.message
    });
    return 1.0; // Default to healthy on error
  }
}

/**
 * Get recent error count (last hour)
 */
async function getRecentErrorCount(sessionId) {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const { count, error } = await supabase
      .from('delivery_logs')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('event_type', 'failed')
      .gte('timestamp', oneHourAgo.toISOString());

    if (error) {
      logger.error('Failed to get error count', { sessionId, error });
      return 0;
    }

    return count || 0;
  } catch (error) {
    logger.error('Failed to get recent error count', {
      sessionId,
      error: error.message
    });
    return 0;
  }
}

/**
 * Pause an unhealthy session
 */
async function pauseUnhealthySession(sessionId, reason) {
  try {
    const { data: session } = await supabase
      .from('waha_sessions')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString(),
        pause_reason: reason
      })
      .eq('id', sessionId)
      .select('session_name, phone_number')
      .single();

    logger.info('Session auto-paused', { sessionId, reason });

    // Emit SSE event for dashboard
    broadcast('session_paused', {
      sessionId,
      sessionName: session?.session_name,
      phoneNumber: session?.phone_number,
      reason
    });

    // Send pause alert to admin (async - don't wait)
    sendSessionPauseAlert(sessionId, reason).catch(error => {
      logger.error('Failed to send session pause alert', {
        sessionId,
        error: error.message
      });
    });
  } catch (error) {
    logger.error('Failed to pause session', {
      sessionId,
      error: error.message
    });
  }
}

/**
 * Redistribute pending messages from a paused session to other healthy sessions
 */
async function redistributePendingMessages(pausedSessionId) {
  try {
    // Get all queued contacts assigned to this session
    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, campaign_id')
      .eq('assigned_session_id', pausedSessionId)
      .eq('status', 'queued');

    if (contactsError || !contacts || contacts.length === 0) {
      logger.debug('No pending messages to redistribute', { pausedSessionId });
      return;
    }

    logger.info('Redistributing pending messages', {
      pausedSessionId,
      count: contacts.length
    });

    // Group by campaign
    const campaignGroups = contacts.reduce((acc, contact) => {
      if (!acc[contact.campaign_id]) {
        acc[contact.campaign_id] = [];
      }
      acc[contact.campaign_id].push(contact.id);
      return acc;
    }, {});

    // For each campaign, find alternative sessions
    for (const [campaignId, contactIds] of Object.entries(campaignGroups)) {
      // Get campaign's sender sessions (excluding the paused one)
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('sender_session_ids')
        .eq('id', campaignId)
        .single();

      if (!campaign || !campaign.sender_session_ids) {
        continue;
      }

      const alternativeSessions = campaign.sender_session_ids.filter(
        id => id !== pausedSessionId
      );

      if (alternativeSessions.length === 0) {
        logger.warn('No alternative sessions available', {
          campaignId,
          pausedSessionId
        });
        continue;
      }

      // Get healthy alternative sessions
      const { data: healthySessions } = await supabase
        .from('waha_sessions')
        .select('id, health_score, messages_sent_today, daily_quota')
        .in('id', alternativeSessions)
        .eq('status', 'connected')
        .order('health_score', { ascending: false });

      if (!healthySessions || healthySessions.length === 0) {
        logger.warn('No healthy alternative sessions', {
          campaignId,
          pausedSessionId
        });
        continue;
      }

      // Reassign contacts to healthy sessions (round-robin)
      let sessionIndex = 0;
      for (const contactId of contactIds) {
        const newSession = healthySessions[sessionIndex];

        // Check if session has quota available
        if (newSession.messages_sent_today < newSession.daily_quota) {
          await supabase
            .from('contacts')
            .update({
              assigned_session_id: newSession.id,
              status: 'pending' // Reset to pending for re-scheduling
            })
            .eq('id', contactId);

          logger.debug('Contact reassigned', {
            contactId,
            fromSession: pausedSessionId,
            toSession: newSession.id
          });
        }

        // Move to next session (round-robin)
        sessionIndex = (sessionIndex + 1) % healthySessions.length;
      }
    }

    logger.info('Message redistribution complete', {
      pausedSessionId,
      redistributed: contacts.length
    });
  } catch (error) {
    logger.error('Failed to redistribute messages', {
      pausedSessionId,
      error: error.message
    });
  }
}

/**
 * Check all active sessions
 */
export async function checkAllSessions() {
  try {
    logger.info('Starting health check for all sessions');

    // Get all connected sessions
    const { data: sessions, error } = await supabase
      .from('waha_sessions')
      .select('id, phone_number')
      .eq('status', 'connected');

    if (error) {
      logger.error('Failed to fetch sessions', { error });
      return {
        totalChecked: 0,
        autoPaused: 0,
        avgHealthScore: 1.0,
        results: []
      };
    }

    if (!sessions || sessions.length === 0) {
      logger.debug('No connected sessions to check');
      return {
        totalChecked: 0,
        autoPaused: 0,
        avgHealthScore: 1.0,
        results: []
      };
    }

    logger.info(`Checking ${sessions.length} sessions`);

    // Check each session
    const results = [];
    for (const session of sessions) {
      const result = await checkSessionHealth(session.id);
      if (result) {
        results.push(result);
      }
    }

    // Summary
    const pausedCount = results.filter(r => r.shouldPause).length;
    const avgHealthScore = results.reduce((sum, r) => sum + r.healthScore, 0) / results.length;

    logger.info('Health check complete', {
      totalChecked: results.length,
      autoPaused: pausedCount,
      avgHealthScore: avgHealthScore.toFixed(2)
    });

    return {
      totalChecked: results.length,
      autoPaused: pausedCount,
      avgHealthScore,
      results
    };
  } catch (error) {
    logger.error('Failed to check all sessions', { error: error.message });
    throw error;
  }
}

/**
 * Reset daily counters for all sessions
 * Should be called at midnight
 */
export async function resetDailyCounters() {
  try {
    logger.info('Resetting daily counters for all sessions');

    // Use the database function
    const { error } = await supabase.rpc('reset_daily_session_counters');

    if (error) {
      logger.error('Failed to reset daily counters', { error });
      throw error;
    }

    // Also resume auto-paused sessions (those paused due to errors)
    const { data: resumedSessions } = await supabase
      .from('waha_sessions')
      .update({
        status: 'connected',
        paused_at: null,
        pause_reason: null
      })
      .eq('status', 'paused')
      .like('pause_reason', 'Auto-paused:%')
      .select('id, session_name, phone_number');

    // Emit SSE events for resumed sessions
    if (resumedSessions && resumedSessions.length > 0) {
      for (const session of resumedSessions) {
        broadcast('session_resumed', {
          sessionId: session.id,
          sessionName: session.session_name,
          phoneNumber: session.phone_number,
          reason: 'Daily reset - Auto-resumed'
        });
      }
    }

    logger.info('Daily reset complete', {
      resumedSessions: resumedSessions?.length || 0
    });

    return {
      success: true,
      resumedSessions: resumedSessions?.length || 0
    };
  } catch (error) {
    logger.error('Failed to reset daily counters', { error: error.message });
    throw error;
  }
}

/**
 * Verify WAHA connection for a session
 */
export async function verifyWAHAConnection(sessionId) {
  try {
    const { data: session } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return { connected: false, error: 'Session not found' };
    }

    // Try to get session status from WAHA
    const wahaService = new WAHAService(session);
    const wahaStatus = await wahaService.getSession();

    const isConnected = wahaStatus.status === 'WORKING' || wahaStatus.status === 'CONNECTED';

    // Update database if status changed
    if (isConnected && session.status !== 'connected') {
      await supabase
        .from('waha_sessions')
        .update({ status: 'connected' })
        .eq('id', sessionId);

      logger.info('Session reconnected', {
        sessionId,
        phone: session.phone_number
      });
    } else if (!isConnected && session.status === 'connected') {
      await supabase
        .from('waha_sessions')
        .update({ status: 'disconnected' })
        .eq('id', sessionId);

      logger.warn('Session disconnected', {
        sessionId,
        phone: session.phone_number
      });
    }

    return {
      connected: isConnected,
      wahaStatus: wahaStatus.status,
      dbStatus: session.status
    };
  } catch (error) {
    logger.error('Failed to verify WAHA connection', {
      sessionId,
      error: error.message
    });

    return {
      connected: false,
      error: error.message
    };
  }
}

/**
 * Check if session needs to rest based on consecutive messages sent
 */
export async function checkIfNeedsRest(sessionId) {
  try {
    const { data: session } = await supabase
      .from('waha_sessions')
      .select('consecutive_messages_sent, is_resting, rest_until')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return { needsRest: false, reason: 'Session not found' };
    }

    // Already resting
    if (session.is_resting) {
      return { needsRest: true, reason: 'Already resting', restUntil: session.rest_until };
    }

    // Get rest threshold from settings
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'rest_after_messages')
      .single();

    const restThreshold = settings ? parseInt(settings.value) : 25;

    // Check if reached threshold
    if (session.consecutive_messages_sent >= restThreshold) {
      return {
        needsRest: true,
        reason: `Reached threshold: ${session.consecutive_messages_sent}/${restThreshold} messages`,
        consecutiveSent: session.consecutive_messages_sent
      };
    }

    return { needsRest: false, consecutiveSent: session.consecutive_messages_sent };
  } catch (error) {
    logger.error('Failed to check if session needs rest', {
      sessionId,
      error: error.message
    });
    return { needsRest: false, error: error.message };
  }
}

/**
 * Trigger resting period for a session
 */
export async function triggerSessionRest(sessionId, reason = 'Consecutive messages limit reached') {
  try {
    logger.info('Triggering session rest', { sessionId, reason });

    // Get rest duration from settings (random between min and max)
    const { data: minSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'rest_duration_min')
      .single();

    const { data: maxSettings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'rest_duration_max')
      .single();

    const minDuration = minSettings ? parseInt(minSettings.value) : 30;
    const maxDuration = maxSettings ? parseInt(maxSettings.value) : 60;

    // Random rest duration between min and max
    const restDuration = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;

    // Use database function to trigger rest
    const { error } = await supabase.rpc('trigger_session_rest', {
      p_session_id: sessionId,
      p_rest_duration_minutes: restDuration
    });

    if (error) {
      logger.error('Failed to trigger session rest via RPC', { sessionId, error });
      throw error;
    }

    // Get session details for notification
    const { data: session } = await supabase
      .from('waha_sessions')
      .select('session_name, phone_number, consecutive_messages_sent, rest_until')
      .eq('id', sessionId)
      .single();

    logger.info('Session rest triggered successfully', {
      sessionId,
      sessionName: session?.session_name,
      phoneNumber: session?.phone_number,
      restDuration,
      restUntil: session?.rest_until,
      messagesSent: session?.consecutive_messages_sent
    });

    // Emit SSE event
    broadcast('session_resting', {
      sessionId,
      sessionName: session?.session_name,
      phoneNumber: session?.phone_number,
      reason,
      restDuration,
      restUntil: session?.rest_until
    });

    // Redistribute pending messages from this session
    await redistributePendingMessages(sessionId);

    // Check if any campaigns should be auto-paused (all sessions resting)
    // Get all campaigns using this session
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id')
      .contains('sender_session_ids', [sessionId])
      .eq('status', 'active');

    if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
        await checkCampaignAutoPause(campaign.id);
      }
    }

    return {
      success: true,
      restDuration,
      restUntil: session?.rest_until
    };
  } catch (error) {
    logger.error('Failed to trigger session rest', {
      sessionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Resume session from resting period
 */
export async function resumeFromRest(sessionId) {
  try {
    logger.info('Resuming session from rest', { sessionId });

    // Use database function to resume
    const { error } = await supabase.rpc('resume_session_from_rest', {
      p_session_id: sessionId
    });

    if (error) {
      logger.error('Failed to resume session via RPC', { sessionId, error });
      throw error;
    }

    // Get session details
    const { data: session } = await supabase
      .from('waha_sessions')
      .select('session_name, phone_number, is_resting')
      .eq('id', sessionId)
      .single();

    if (session && !session.is_resting) {
      logger.info('Session resumed from rest successfully', {
        sessionId,
        sessionName: session.session_name,
        phoneNumber: session.phone_number
      });

      // Emit SSE event
      broadcast('session_resumed_from_rest', {
        sessionId,
        sessionName: session.session_name,
        phoneNumber: session.phone_number,
        reason: 'Rest period completed'
      });

      return { success: true };
    }

    return { success: false, reason: 'Session not eligible for resume' };
  } catch (error) {
    logger.error('Failed to resume session from rest', {
      sessionId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Auto-resume all sessions whose rest period has ended
 * Called by scheduled worker
 */
export async function autoResumeRestingSessions() {
  try {
    logger.info('Checking for sessions to auto-resume from rest');

    // Use database function to resume all eligible sessions
    const { data: resumedSessions, error } = await supabase.rpc('auto_resume_resting_sessions');

    if (error) {
      logger.error('Failed to auto-resume resting sessions', { error });
      throw error;
    }

    if (!resumedSessions || resumedSessions.length === 0) {
      logger.debug('No sessions to auto-resume');
      return { resumedCount: 0, sessions: [] };
    }

    logger.info('Auto-resumed sessions from rest', {
      count: resumedSessions.length,
      sessions: resumedSessions.map(s => ({
        id: s.resumed_session_id,
        name: s.session_name,
        phone: s.phone_number
      }))
    });

    // Emit SSE events for each resumed session
    for (const session of resumedSessions) {
      broadcast('session_resumed_from_rest', {
        sessionId: session.resumed_session_id,
        sessionName: session.session_name,
        phoneNumber: session.phone_number,
        reason: 'Auto-resumed after rest period'
      });
    }

    // Auto-resume campaigns that were paused due to all sessions resting
    const campaignResumeResult = await autoResumeCampaignsAfterRest();

    logger.info('Session and campaign auto-resume complete', {
      sessionsResumed: resumedSessions.length,
      campaignsResumed: campaignResumeResult.resumedCount
    });

    return {
      resumedCount: resumedSessions.length,
      sessions: resumedSessions,
      campaignsResumed: campaignResumeResult.resumedCount,
      campaigns: campaignResumeResult.campaigns
    };
  } catch (error) {
    logger.error('Failed to auto-resume resting sessions', { error: error.message });
    throw error;
  }
}

/**
 * Check if campaign should be auto-paused due to all sessions resting
 */
export async function checkCampaignAutoPause(campaignId) {
  try {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('sender_session_ids, status')
      .eq('id', campaignId)
      .single();

    if (!campaign || campaign.status !== 'active') {
      return { shouldPause: false };
    }

    if (!campaign.sender_session_ids || campaign.sender_session_ids.length === 0) {
      return { shouldPause: false };
    }

    // Check all sender sessions
    const { data: sessions } = await supabase
      .from('waha_sessions')
      .select('id, is_resting, status')
      .in('id', campaign.sender_session_ids);

    if (!sessions || sessions.length === 0) {
      return { shouldPause: false };
    }

    // Check if ALL sessions are resting or not connected
    const allResting = sessions.every(s => s.is_resting === true || s.status !== 'connected');

    if (allResting) {
      logger.info('All campaign sessions are resting - auto-pausing campaign', {
        campaignId,
        sessionsCount: sessions.length
      });

      // Pause campaign
      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          pause_reason: 'Auto-paused: All sender sessions are resting'
        })
        .eq('id', campaignId);

      // Emit SSE event
      broadcast('campaign_paused', {
        campaignId,
        reason: 'All sender sessions resting'
      });

      return { shouldPause: true, reason: 'all_sessions_resting' };
    }

    return { shouldPause: false };
  } catch (error) {
    logger.error('Failed to check campaign auto-pause', {
      campaignId,
      error: error.message
    });
    return { shouldPause: false, error: error.message };
  }
}

/**
 * Auto-resume campaigns that were paused due to all sessions resting
 */
export async function autoResumeCampaignsAfterRest() {
  try {
    logger.info('Checking for campaigns to auto-resume after sessions rest');

    // Find campaigns paused due to "all sessions resting"
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('id, sender_session_ids, name')
      .eq('status', 'paused')
      .ilike('pause_reason', '%All sender sessions are resting%');

    if (error) {
      logger.error('Failed to fetch paused campaigns', { error });
      return { resumedCount: 0, campaigns: [] };
    }

    if (!campaigns || campaigns.length === 0) {
      logger.debug('No campaigns waiting for session resume');
      return { resumedCount: 0, campaigns: [] };
    }

    const resumedCampaigns = [];

    for (const campaign of campaigns) {
      // Check if any session is now available (not resting, connected)
      const { data: sessions } = await supabase
        .from('waha_sessions')
        .select('id, is_resting, status')
        .in('id', campaign.sender_session_ids);

      const hasAvailableSession = sessions?.some(
        s => s.is_resting === false && s.status === 'connected'
      );

      if (hasAvailableSession) {
        logger.info('Resuming campaign - sessions now available', {
          campaignId: campaign.id,
          campaignName: campaign.name
        });

        // Resume campaign
        await supabase
          .from('campaigns')
          .update({
            status: 'active',
            paused_at: null,
            pause_reason: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaign.id);

        // Emit SSE event
        broadcast('campaign_resumed', {
          campaignId: campaign.id,
          campaignName: campaign.name,
          reason: 'Sessions resumed from rest'
        });

        resumedCampaigns.push({
          id: campaign.id,
          name: campaign.name
        });
      }
    }

    if (resumedCampaigns.length > 0) {
      logger.info('Auto-resumed campaigns', {
        count: resumedCampaigns.length,
        campaigns: resumedCampaigns
      });
    }

    return {
      resumedCount: resumedCampaigns.length,
      campaigns: resumedCampaigns
    };
  } catch (error) {
    logger.error('Failed to auto-resume campaigns', { error: error.message });
    return { resumedCount: 0, campaigns: [], error: error.message };
  }
}

export default {
  checkSessionHealth,
  calculateHealthScore,
  checkAllSessions,
  resetDailyCounters,
  verifyWAHAConnection,
  checkIfNeedsRest,
  triggerSessionRest,
  resumeFromRest,
  autoResumeRestingSessions,
  checkCampaignAutoPause,
  autoResumeCampaignsAfterRest
};
