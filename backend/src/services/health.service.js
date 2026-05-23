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
      return;
    }

    if (!sessions || sessions.length === 0) {
      logger.debug('No connected sessions to check');
      return;
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

export default {
  checkSessionHealth,
  calculateHealthScore,
  checkAllSessions,
  resetDailyCounters,
  verifyWAHAConnection
};
