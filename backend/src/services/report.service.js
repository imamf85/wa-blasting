import supabase from '../config/supabase.js';
import WAHAService from './waha.service.js';
import { formatPhoneForWAHA } from '../utils/phoneFormatter.js';
import logger from '../utils/logger.js';

const options = {
  timeZone: 'Asia/Jakarta',
  dateStyle: 'full',
  timeStyle: 'long',
  hour12: false
};

async function getAdminWhatsApp() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'admin_whatsapp')
      .single();

    if (error || !data) {
      logger.warn('Admin WhatsApp not configured in system settings');
      return null;
    }

    return data.value;
  } catch (error) {
    logger.error('Failed to get admin WhatsApp', { error: error.message });
    return null;
  }
}

/**
 * Get first available connected session for sending reports
 */
async function getReportSession() {
  try {
    const { data: sessions, error } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('status', 'connected')
      .order('health_score', { ascending: false })
      .limit(1);

    if (error || !sessions || sessions.length === 0) {
      logger.error('No connected sessions available for sending reports');
      return null;
    }

    return sessions[0];
  } catch (error) {
    logger.error('Failed to get report session', { error: error.message });
    return null;
  }
}

/**
 * Send WhatsApp message to admin
 */
async function sendToAdmin(message) {
  try {
    const adminPhone = await getAdminWhatsApp();
    if (!adminPhone) {
      logger.warn('Cannot send report: admin WhatsApp not configured');
      return { success: false, error: 'Admin WhatsApp not configured' };
    }

    const session = await getReportSession();
    if (!session) {
      logger.error('Cannot send report: no available session');
      return { success: false, error: 'No available session' };
    }

    const wahaService = new WAHAService(session);
    const chatId = formatPhoneForWAHA(adminPhone);

    logger.info('Sending report to admin', {
      adminPhone,
      sessionId: session.id,
      messageLength: message.length
    });

    const response = await wahaService.sendMessage({
      chatId,
      text: message
    });

    return {
      success: true,
      wahaMessageId: response.id,
      sessionId: session.id
    };
  } catch (error) {
    logger.error('Failed to send report to admin', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Save report to database
 */
async function saveReport(reportData) {
  try {
    const { data, error } = await supabase
      .from('reports')
      .insert([reportData])
      .select()
      .single();

    if (error) {
      logger.error('Failed to save report', { error });
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Failed to save report', { error: error.message });
    return null;
  }
}

/**
 * Format campaign start report
 */
function formatCampaignStartReport(campaign, stats) {
  const emoji = '🚀';

  return `${emoji} *Campaign Started*

📋 *Name:* ${campaign.name}

📊 *Details:*
• Total Contacts: ${stats.total.toLocaleString()}
• Sender Sessions: ${campaign.sender_session_ids?.length || 0}
• Delay Range: ${campaign.delay_min}-${campaign.delay_max}s
• Peak Hours Avoidance: ${campaign.avoid_peak_hours ? 'Yes' : 'No'}

⏰ *Started:* ${new Date().toLocaleString('id-ID', options)}

${estimateDuration(stats.total, campaign.delay_min, campaign.delay_max)}

_Sending in progress... You'll receive a completion report when done._`;
}

/**
 * Format campaign completion report
 */
function formatCampaignCompleteReport(campaign, stats) {
  const successRate = ((stats.sent / stats.total) * 100).toFixed(1);
  const emoji = successRate >= 95 ? '✅' : successRate >= 85 ? '⚠️' : '❌';

  const duration = campaign.started_at && campaign.completed_at
    ? formatDuration(
      new Date(campaign.started_at),
      new Date(campaign.completed_at)
    )
    : 'N/A';

  return `${emoji} *Campaign Completed*

📋 *Name:* ${campaign.name}

📊 *Results:*
• Total: ${stats.total.toLocaleString()}
• ✅ Sent: ${stats.sent.toLocaleString()}
• ❌ Failed: ${stats.failed.toLocaleString()}
• 📈 Success Rate: *${successRate}%*

⏱️ *Duration:* ${duration}

⏰ *Completed:* ${new Date().toLocaleString('id-ID', options)}

${successRate >= 95
      ? '🎉 Excellent delivery rate!'
      : successRate >= 85
        ? '✓ Good delivery rate. Check failed messages if needed.'
        : '⚠️ Lower than expected success rate. Please review error logs.'}`;
}

/**
 * Format session auto-pause alert
 */
function formatSessionPauseAlert(session, reason) {
  return `⏸️ *Session Auto-Paused*

📱 *Session:* ${session.session_name}
📞 *Number:* ${session.phone_number}

⚠️ *Reason:* ${reason}

📊 *Current Status:*
• Health Score: ${(session.health_score * 100).toFixed(0)}%
• Messages Today: ${session.messages_sent_today}/${session.daily_quota}
• Errors Today: ${session.error_count_today}

🔧 *Action Required:*
The session has been automatically paused to prevent further issues. Pending messages have been redistributed to other sessions.

💡 *Next Steps:*
1. Check WAHA connection
2. Review error logs
3. Session will auto-resume after daily reset (midnight)

⏰ *Time:* ${new Date().toLocaleString('id-ID', options)}`;
}

/**
 * Format high error rate alert
 */
function formatHighErrorAlert(session, errorCount) {
  return `🚨 *High Error Rate Alert*

📱 *Session:* ${session.session_name}
📞 *Number:* ${session.phone_number}

⚠️ *Issue:* High number of errors detected

📊 *Error Stats:*
• Errors in Last Hour: ${errorCount}
• Health Score: ${(session.health_score * 100).toFixed(0)}%
• Status: ${session.status}

🔍 *Recommendation:*
Please check the session connection and WAHA logs for details.

⏰ *Time:* ${new Date().toLocaleString('id-ID', options)}`;
}

/**
 * Format daily summary report
 */
function formatDailySummary(stats) {
  const successRate = stats.total > 0
    ? ((stats.sent / stats.total) * 100).toFixed(1)
    : 0;

  return `📊 *Daily Summary Report*

📅 *Date:* ${new Date().toLocaleDateString(
    'id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }
  )}

📈 *Messages:*
• Total Sent: ${stats.sent.toLocaleString()}
• Failed: ${stats.failed.toLocaleString()}
• Success Rate: ${successRate}%

🎯 *Campaigns:*
• Active: ${stats.campaigns.active}
• Completed Today: ${stats.campaigns.completed_today}
• Total: ${stats.campaigns.total}

📱 *Sessions:*
• Connected: ${stats.sessions.connected}/${stats.sessions.total}
• Avg Health Score: ${(stats.sessions.avg_health * 100).toFixed(0)}%
• Paused: ${stats.sessions.paused}

💬 *Top Performing Session:*
${stats.topSession ? `${stats.topSession.name} - ${stats.topSession.sent} messages` : 'N/A'}

⏰ *Generated:* ${new Date().toLocaleString('id-ID', options)}`;
}

/**
 * Estimate campaign duration
 */
function estimateDuration(totalContacts, delayMin, delayMax) {
  const avgDelay = (delayMin + delayMax) / 2;
  const totalSeconds = totalContacts * avgDelay;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  let estimate = '⏱️ *Estimated Duration:* ';

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    estimate += `${days}d ${remainingHours}h`;
  } else if (hours > 0) {
    estimate += `${hours}h ${minutes}m`;
  } else {
    estimate += `${minutes} minutes`;
  }

  return estimate;
}

/**
 * Format duration between two dates
 */
function formatDuration(startDate, endDate) {
  const diffMs = endDate - startDate;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const hours = diffHours % 24;
    const minutes = diffMinutes % 60;
    return `${diffDays}d ${hours}h ${minutes}m`;
  } else if (diffHours > 0) {
    const minutes = diffMinutes % 60;
    return `${diffHours}h ${minutes}m`;
  } else if (diffMinutes > 0) {
    const seconds = diffSeconds % 60;
    return `${diffMinutes}m ${seconds}s`;
  } else {
    return `${diffSeconds}s`;
  }
}

/**
 * Send campaign start report
 */
export async function sendCampaignStartReport(campaignId) {
  try {
    logger.info('Generating campaign start report', { campaignId });

    // Get campaign details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      logger.error('Campaign not found', { campaignId });
      return { success: false, error: 'Campaign not found' };
    }

    // Get campaign stats
    const { data: contacts } = await supabase
      .from('contacts')
      .select('status')
      .eq('campaign_id', campaignId);

    const stats = {
      total: contacts?.length || 0,
      sent: contacts?.filter(c => c.status === 'sent').length || 0,
      failed: contacts?.filter(c => c.status === 'failed').length || 0,
    };

    // Format message
    const message = formatCampaignStartReport(campaign, stats);

    // Send to admin
    const sendResult = await sendToAdmin(message);

    // Save report
    await saveReport({
      campaign_id: campaignId,
      report_type: 'campaign_start',
      message_text: message,
      sent_to_admin: sendResult.success,
      waha_message_id: sendResult.wahaMessageId,
      error_message: sendResult.error
    });

    logger.info('Campaign start report sent', {
      campaignId,
      success: sendResult.success
    });

    return sendResult;
  } catch (error) {
    logger.error('Failed to send campaign start report', {
      campaignId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send campaign completion report
 */
export async function sendCampaignCompleteReport(campaignId) {
  try {
    logger.info('Generating campaign completion report', { campaignId });

    // Get campaign details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) {
      logger.error('Campaign not found', { campaignId });
      return { success: false, error: 'Campaign not found' };
    }

    // Get campaign stats
    const { data: contacts } = await supabase
      .from('contacts')
      .select('status')
      .eq('campaign_id', campaignId);

    const stats = {
      total: contacts?.length || 0,
      sent: contacts?.filter(c => c.status === 'sent').length || 0,
      failed: contacts?.filter(c => c.status === 'failed').length || 0,
    };

    // Format message
    const message = formatCampaignCompleteReport(campaign, stats);

    // Send to admin
    const sendResult = await sendToAdmin(message);

    // Save report
    await saveReport({
      campaign_id: campaignId,
      report_type: 'campaign_complete',
      message_text: message,
      sent_to_admin: sendResult.success,
      waha_message_id: sendResult.wahaMessageId,
      error_message: sendResult.error
    });

    logger.info('Campaign completion report sent', {
      campaignId,
      success: sendResult.success
    });

    return sendResult;
  } catch (error) {
    logger.error('Failed to send campaign completion report', {
      campaignId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send session pause alert
 */
export async function sendSessionPauseAlert(sessionId, reason) {
  try {
    logger.info('Generating session pause alert', { sessionId, reason });

    // Get session details
    const { data: session } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      logger.error('Session not found', { sessionId });
      return { success: false, error: 'Session not found' };
    }

    // Format message
    const message = formatSessionPauseAlert(session, reason);

    // Send to admin
    const sendResult = await sendToAdmin(message);

    // Save report
    await saveReport({
      session_id: sessionId,
      report_type: 'session_paused',
      message_text: message,
      sent_to_admin: sendResult.success,
      waha_message_id: sendResult.wahaMessageId,
      error_message: sendResult.error
    });

    logger.info('Session pause alert sent', {
      sessionId,
      success: sendResult.success
    });

    return sendResult;
  } catch (error) {
    logger.error('Failed to send session pause alert', {
      sessionId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send high error rate alert
 */
export async function sendHighErrorAlert(sessionId, errorCount) {
  try {
    logger.info('Generating high error alert', { sessionId, errorCount });

    // Get session details
    const { data: session } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (!session) {
      logger.error('Session not found', { sessionId });
      return { success: false, error: 'Session not found' };
    }

    // Format message
    const message = formatHighErrorAlert(session, errorCount);

    // Send to admin
    const sendResult = await sendToAdmin(message);

    // Save report
    await saveReport({
      session_id: sessionId,
      report_type: 'high_error_alert',
      message_text: message,
      sent_to_admin: sendResult.success,
      waha_message_id: sendResult.wahaMessageId,
      error_message: sendResult.error
    });

    logger.info('High error alert sent', {
      sessionId,
      success: sendResult.success
    });

    return sendResult;
  } catch (error) {
    logger.error('Failed to send high error alert', {
      sessionId,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Generate and send daily summary
 */
export async function sendDailySummary() {
  try {
    logger.info('Generating daily summary report');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get message stats for today
    const { data: deliveryLogs } = await supabase
      .from('delivery_logs')
      .select('event_type')
      .gte('timestamp', today.toISOString());

    const messageSent = deliveryLogs?.filter(l => l.event_type === 'sent').length || 0;
    const messageFailed = deliveryLogs?.filter(l => l.event_type === 'failed').length || 0;

    // Get campaign stats
    const { data: allCampaigns } = await supabase
      .from('campaigns')
      .select('id, status, completed_at');

    const completedToday = allCampaigns?.filter(c =>
      c.status === 'completed' &&
      c.completed_at &&
      new Date(c.completed_at) >= today
    ).length || 0;

    // Get session stats
    const { data: sessions } = await supabase
      .from('waha_sessions')
      .select('id, session_name, status, health_score, messages_sent_today');

    const avgHealth = sessions?.length > 0
      ? sessions.reduce((sum, s) => sum + s.health_score, 0) / sessions.length
      : 0;

    // Find top performing session
    const topSession = sessions?.reduce((top, current) => {
      if (!top || current.messages_sent_today > top.messages_sent_today) {
        return current;
      }
      return top;
    }, null);

    const stats = {
      sent: messageSent,
      failed: messageFailed,
      total: messageSent + messageFailed,
      campaigns: {
        active: allCampaigns?.filter(c => c.status === 'active').length || 0,
        completed_today: completedToday,
        total: allCampaigns?.length || 0,
      },
      sessions: {
        connected: sessions?.filter(s => s.status === 'connected').length || 0,
        total: sessions?.length || 0,
        avg_health: avgHealth,
        paused: sessions?.filter(s => s.status === 'paused').length || 0,
      },
      topSession: topSession ? {
        name: topSession.session_name,
        sent: topSession.messages_sent_today
      } : null
    };

    // Format message
    const message = formatDailySummary(stats);

    // Send to admin
    const sendResult = await sendToAdmin(message);

    // Save report
    await saveReport({
      report_type: 'daily_summary',
      message_text: message,
      sent_to_admin: sendResult.success,
      waha_message_id: sendResult.wahaMessageId,
      error_message: sendResult.error
    });

    logger.info('Daily summary sent', { success: sendResult.success });

    return sendResult;
  } catch (error) {
    logger.error('Failed to send daily summary', { error: error.message });
    return { success: false, error: error.message };
  }
}

export default {
  sendCampaignStartReport,
  sendCampaignCompleteReport,
  sendSessionPauseAlert,
  sendHighErrorAlert,
  sendDailySummary,
};
