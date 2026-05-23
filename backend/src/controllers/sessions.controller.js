import supabase from '../config/supabase.js';
import WAHAService from '../services/waha.service.js';
import { checkSessionHealth, verifyWAHAConnection } from '../services/health.service.js';
import logger from '../utils/logger.js';

/**
 * Get all sessions
 */
export async function getAllSessions(req, res) {
  try {
    const { data, error } = await supabase
      .from('waha_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to fetch sessions', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch sessions'
      });
    }

    res.json({
      sessions: data,
      total: data.length
    });
  } catch (error) {
    logger.error('Get sessions error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch sessions'
    });
  }
}

/**
 * Get single session by ID
 */
export async function getSession(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    res.json({ session: data });
  } catch (error) {
    logger.error('Get session error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch session'
    });
  }
}

/**
 * Create new session
 */
export async function createSession(req, res) {
  try {
    const {
      session_name,
      phone_number,
      waha_api_url,
      waha_api_key,
      account_age
    } = req.body;

    // Validate required fields
    if (!session_name || !phone_number) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'session_name and phone_number are required'
      });
    }

    // Determine daily quota based on account age
    const quotaMap = {
      'new': 50,
      'medium': 150,
      'aged': 300
    };
    const daily_quota = quotaMap[account_age] || 150;

    const { data, error } = await supabase
      .from('waha_sessions')
      .insert([{
        session_name,
        phone_number,
        waha_api_url: waha_api_url || process.env.WAHA_API_BASE_URL,
        waha_api_key,
        account_age: account_age || 'medium',
        daily_quota,
        status: 'disconnected',
        created_by: req.user.id
      }])
      .select()
      .single();

    if (error) {
      logger.error('Failed to create session', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create session'
      });
    }

    logger.info('Session created', { sessionId: data.id, sessionName: session_name });

    res.status(201).json({
      session: data,
      message: 'Session created successfully'
    });
  } catch (error) {
    logger.error('Create session error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create session'
    });
  }
}

/**
 * Update session
 */
export async function updateSession(req, res) {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.created_at;
    delete updates.created_by;
    delete updates.messages_sent_today;
    delete updates.error_count_today;

    const { data, error } = await supabase
      .from('waha_sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    logger.info('Session updated', { sessionId: id });

    res.json({
      session: data,
      message: 'Session updated successfully'
    });
  } catch (error) {
    logger.error('Update session error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update session'
    });
  }
}

/**
 * Delete session
 */
export async function deleteSession(req, res) {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('waha_sessions')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('Failed to delete session', { error });
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete session'
      });
    }

    logger.info('Session deleted', { sessionId: id });

    res.json({
      message: 'Session deleted successfully'
    });
  } catch (error) {
    logger.error('Delete session error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete session'
    });
  }
}

/**
 * Get session QR code
 */
export async function getSessionQR(req, res) {
  try {
    const { id } = req.params;

    // Get session from database
    const { data: session, error } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    // Get QR code from WAHA
    const wahaService = new WAHAService(session);
    const qrData = await wahaService.getQRCode();

    res.json({
      qr: qrData.qr,
      session_name: session.session_name
    });
  } catch (error) {
    logger.error('Get QR code error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get QR code: ' + error.message
    });
  }
}

/**
 * Check session health
 */
export async function getSessionHealth(req, res) {
  try {
    const { id } = req.params;

    // Get session from database
    const { data: session, error } = await supabase
      .from('waha_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !session) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    // Try to get status from WAHA
    let wahaStatus = null;
    try {
      const wahaService = new WAHAService(session);
      const sessionData = await wahaService.getSession();
      wahaStatus = sessionData.status;
    } catch (wahaError) {
      logger.warn('Failed to get WAHA status', { sessionId: id, error: wahaError.message });
    }

    res.json({
      session_id: id,
      phone_number: session.phone_number,
      status: session.status,
      waha_status: wahaStatus,
      health_score: session.health_score,
      messages_sent_today: session.messages_sent_today,
      daily_quota: session.daily_quota,
      error_count_today: session.error_count_today,
      last_error_at: session.last_error_at,
      quota_remaining: session.daily_quota - session.messages_sent_today
    });
  } catch (error) {
    logger.error('Get session health error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get session health'
    });
  }
}

/**
 * Pause session
 */
export async function pauseSession(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('waha_sessions')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    logger.info('Session paused', { sessionId: id });

    res.json({
      session: data,
      message: 'Session paused successfully'
    });
  } catch (error) {
    logger.error('Pause session error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to pause session'
    });
  }
}

/**
 * Resume session
 */
export async function resumeSession(req, res) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('waha_sessions')
      .update({
        status: 'connected',
        paused_at: null
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found'
      });
    }

    logger.info('Session resumed', { sessionId: id });

    res.json({
      session: data,
      message: 'Session resumed successfully'
    });
  } catch (error) {
    logger.error('Resume session error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resume session'
    });
  }
}

/**
 * Run manual health check on session
 */
export async function runHealthCheck(req, res) {
  try {
    const { id } = req.params;

    logger.info('Running manual health check', { sessionId: id });

    const result = await checkSessionHealth(id);

    if (!result) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Session not found or health check failed'
      });
    }

    res.json({
      health_check: result,
      message: result.shouldPause
        ? 'Session health check failed - session paused'
        : 'Session health check passed'
    });
  } catch (error) {
    logger.error('Run health check error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to run health check'
    });
  }
}

/**
 * Verify WAHA connection
 */
export async function verifyConnection(req, res) {
  try {
    const { id } = req.params;

    logger.info('Verifying WAHA connection', { sessionId: id });

    const result = await verifyWAHAConnection(id);

    res.json({
      session_id: id,
      connected: result.connected,
      waha_status: result.wahaStatus,
      db_status: result.dbStatus,
      error: result.error
    });
  } catch (error) {
    logger.error('Verify connection error', { error: error.message });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify connection'
    });
  }
}

export default {
  getAllSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getSessionQR,
  getSessionHealth,
  pauseSession,
  resumeSession,
  runHealthCheck,
  verifyConnection
};
