import supabase from '../config/supabase.js';
import logger from '../utils/logger.js';

/**
 * Get overall dashboard overview
 */
export async function getOverview(req, res) {
  try {
    // Get campaigns summary
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, status');

    // Get sessions summary
    const { data: sessions } = await supabase
      .from('waha_sessions')
      .select('id, status, health_score, messages_sent_today, daily_quota');

    // Get delivery logs summary (today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: deliveryLogs } = await supabase
      .from('delivery_logs')
      .select('event_type')
      .gte('timestamp', todayStart.toISOString());

    // Calculate statistics
    const campaignStats = {
      total: campaigns?.length || 0,
      active: campaigns?.filter(c => c.status === 'active').length || 0,
      completed: campaigns?.filter(c => c.status === 'completed').length || 0,
      paused: campaigns?.filter(c => c.status === 'paused').length || 0,
      draft: campaigns?.filter(c => c.status === 'draft').length || 0
    };

    const sessionStats = {
      total: sessions?.length || 0,
      connected: sessions?.filter(s => s.status === 'connected').length || 0,
      disconnected: sessions?.filter(s => s.status === 'disconnected').length || 0,
      paused: sessions?.filter(s => s.status === 'paused').length || 0,
      averageHealth: sessions?.length > 0
        ? (sessions.reduce((sum, s) => sum + (s.health_score || 0), 0) / sessions.length).toFixed(2)
        : 0,
      totalQuota: sessions?.reduce((sum, s) => sum + s.daily_quota, 0) || 0,
      totalSentToday: sessions?.reduce((sum, s) => sum + s.messages_sent_today, 0) || 0,
      quotaRemaining: sessions?.reduce((sum, s) => sum + (s.daily_quota - s.messages_sent_today), 0) || 0
    };

    const messageStats = {
      sentToday: deliveryLogs?.filter(l => l.event_type === 'sent').length || 0,
      failedToday: deliveryLogs?.filter(l => l.event_type === 'failed').length || 0,
      totalToday: deliveryLogs?.length || 0,
      successRate: deliveryLogs?.length > 0
        ? ((deliveryLogs.filter(l => l.event_type === 'sent').length / deliveryLogs.length) * 100).toFixed(1)
        : 0
    };

    res.json({
      campaigns: campaignStats,
      sessions: sessionStats,
      messages: messageStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get dashboard overview', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch dashboard overview'
    });
  }
}

/**
 * Get sessions overview with health details
 */
export async function getSessionsOverview(req, res) {
  try {
    const { data: sessions, error } = await supabase
      .from('waha_sessions')
      .select('*')
      .order('health_score', { ascending: false });

    if (error) {
      throw error;
    }

    // Get delivery stats for each session (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const sessionsWithStats = await Promise.all(
      sessions.map(async (session) => {
        const { data: logs } = await supabase
          .from('delivery_logs')
          .select('event_type')
          .eq('session_id', session.id)
          .gte('timestamp', oneHourAgo.toISOString());

        const sent = logs?.filter(l => l.event_type === 'sent').length || 0;
        const failed = logs?.filter(l => l.event_type === 'failed').length || 0;

        return {
          ...session,
          lastHour: {
            sent,
            failed,
            total: sent + failed,
            successRate: (sent + failed) > 0 ? ((sent / (sent + failed)) * 100).toFixed(1) : 0
          },
          quotaUsage: {
            used: session.messages_sent_today,
            total: session.daily_quota,
            remaining: session.daily_quota - session.messages_sent_today,
            percentage: ((session.messages_sent_today / session.daily_quota) * 100).toFixed(1)
          }
        };
      })
    );

    res.json({
      sessions: sessionsWithStats,
      total: sessionsWithStats.length
    });

  } catch (error) {
    logger.error('Failed to get sessions overview', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch sessions overview'
    });
  }
}

/**
 * Get campaigns overview with progress
 */
export async function getCampaignsOverview(req, res) {
  try {
    const { status } = req.query;

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      throw error;
    }

    // Get contact stats for each campaign
    const campaignsWithStats = await Promise.all(
      campaigns.map(async (campaign) => {
        const { data: contacts } = await supabase
          .from('contacts')
          .select('status')
          .eq('campaign_id', campaign.id);

        const total = contacts?.length || 0;
        const sent = contacts?.filter(c => c.status === 'sent').length || 0;
        const failed = contacts?.filter(c => c.status === 'failed').length || 0;
        const queued = contacts?.filter(c => c.status === 'queued').length || 0;
        const sending = contacts?.filter(c => c.status === 'sending').length || 0;
        const pending = contacts?.filter(c => c.status === 'pending').length || 0;

        const progress = total > 0 ? (((sent + failed) / total) * 100).toFixed(1) : 0;
        const successRate = (sent + failed) > 0 ? ((sent / (sent + failed)) * 100).toFixed(1) : 0;

        // Calculate estimated completion time
        let estimatedCompletion = null;
        if (campaign.status === 'active' && queued > 0 && campaign.started_at) {
          const avgDelay = (campaign.delay_min + campaign.delay_max) / 2;
          const remainingSeconds = queued * avgDelay;
          estimatedCompletion = new Date(Date.now() + remainingSeconds * 1000).toISOString();
        }

        return {
          ...campaign,
          stats: {
            total,
            sent,
            failed,
            queued,
            sending,
            pending,
            progress: parseFloat(progress),
            successRate: parseFloat(successRate)
          },
          estimatedCompletion
        };
      })
    );

    res.json({
      campaigns: campaignsWithStats,
      total: campaignsWithStats.length
    });

  } catch (error) {
    logger.error('Failed to get campaigns overview', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch campaigns overview'
    });
  }
}

export default {
  getOverview,
  getSessionsOverview,
  getCampaignsOverview
};
