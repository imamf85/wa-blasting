import logger from '../utils/logger.js';

/**
 * Server-Sent Events (SSE) Manager
 * Handles real-time push notifications to connected clients
 */

// Store active SSE connections
// Map: campaignId -> Set of response objects
const campaignClients = new Map();

// Map: userId -> Set of response objects (for global events)
const userClients = new Map();

/**
 * SSE handler for campaign-specific events
 * GET /api/campaigns/:campaignId/stream
 */
export function campaignSSEHandler(req, res) {
  const { campaignId } = req.params;
  const userId = req.user?.id;

  logger.info('SSE client connected', { campaignId, userId });

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable nginx buffering
  });

  // Send initial connection message
  res.write('event: connected\n');
  res.write(`data: ${JSON.stringify({ campaignId, timestamp: new Date().toISOString() })}\n\n`);

  // Add client to campaign subscribers
  if (!campaignClients.has(campaignId)) {
    campaignClients.set(campaignId, new Set());
  }
  campaignClients.get(campaignId).add(res);

  // Keep-alive ping every 30 seconds
  const keepAliveInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    logger.info('SSE client disconnected', { campaignId, userId });

    clearInterval(keepAliveInterval);

    // Remove client from subscribers
    const clients = campaignClients.get(campaignId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        campaignClients.delete(campaignId);
      }
    }

    res.end();
  });
}

/**
 * SSE handler for dashboard global events
 * GET /api/dashboard/stream
 */
export function dashboardSSEHandler(req, res) {
  const userId = req.user?.id;

  logger.info('Dashboard SSE client connected', { userId });

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send initial connection message
  res.write('event: connected\n');
  res.write(`data: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`);

  // Add client to user subscribers
  if (!userClients.has(userId)) {
    userClients.set(userId, new Set());
  }
  userClients.get(userId).add(res);

  // Keep-alive ping every 30 seconds
  const keepAliveInterval = setInterval(() => {
    res.write(':ping\n\n');
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    logger.info('Dashboard SSE client disconnected', { userId });

    clearInterval(keepAliveInterval);

    const clients = userClients.get(userId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        userClients.delete(userId);
      }
    }

    res.end();
  });
}

/**
 * Emit event to all clients subscribed to a campaign
 */
export function emitToCampaign(campaignId, event, data) {
  const clients = campaignClients.get(campaignId);

  if (!clients || clients.size === 0) {
    logger.debug('No clients subscribed to campaign', { campaignId });
    return;
  }

  const eventData = {
    ...data,
    campaignId,
    timestamp: new Date().toISOString()
  };

  const message = `event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`;

  logger.debug('Emitting SSE event to campaign clients', {
    campaignId,
    event,
    clientCount: clients.size
  });

  // Send to all connected clients
  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      logger.error('Failed to write to SSE client', { error: error.message });
      clients.delete(client);
    }
  }
}

/**
 * Emit event to all clients subscribed to a user's dashboard
 */
export function emitToUser(userId, event, data) {
  const clients = userClients.get(userId);

  if (!clients || clients.size === 0) {
    logger.debug('No clients subscribed to user', { userId });
    return;
  }

  const eventData = {
    ...data,
    userId,
    timestamp: new Date().toISOString()
  };

  const message = `event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`;

  logger.debug('Emitting SSE event to user clients', {
    userId,
    event,
    clientCount: clients.size
  });

  for (const client of clients) {
    try {
      client.write(message);
    } catch (error) {
      logger.error('Failed to write to SSE client', { error: error.message });
      clients.delete(client);
    }
  }
}

/**
 * Broadcast event to all connected clients (all campaigns, all users)
 */
export function broadcast(event, data) {
  const eventData = {
    ...data,
    timestamp: new Date().toISOString()
  };

  const message = `event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`;

  let totalClients = 0;

  // Broadcast to all campaign clients
  for (const [campaignId, clients] of campaignClients.entries()) {
    for (const client of clients) {
      try {
        client.write(message);
        totalClients++;
      } catch (error) {
        logger.error('Failed to write to SSE client', { error: error.message });
        clients.delete(client);
      }
    }
  }

  // Broadcast to all user clients
  for (const [userId, clients] of userClients.entries()) {
    for (const client of clients) {
      try {
        client.write(message);
        totalClients++;
      } catch (error) {
        logger.error('Failed to write to SSE client', { error: error.message });
        clients.delete(client);
      }
    }
  }

  logger.debug('Broadcasted SSE event', { event, clientCount: totalClients });
}

/**
 * Get connection statistics
 */
export function getConnectionStats() {
  const campaignConnections = {};
  for (const [campaignId, clients] of campaignClients.entries()) {
    campaignConnections[campaignId] = clients.size;
  }

  const userConnections = {};
  for (const [userId, clients] of userClients.entries()) {
    userConnections[userId] = clients.size;
  }

  return {
    totalCampaignClients: Array.from(campaignClients.values()).reduce((sum, clients) => sum + clients.size, 0),
    totalUserClients: Array.from(userClients.values()).reduce((sum, clients) => sum + clients.size, 0),
    campaignConnections,
    userConnections
  };
}

/**
 * Event types for reference:
 *
 * Campaign Events:
 * - message_sent: { contactId, contactName, contactPhone, sessionId }
 * - message_failed: { contactId, contactName, error, sessionId }
 * - campaign_started: { campaignId, campaignName, totalContacts }
 * - campaign_completed: { campaignId, stats }
 * - campaign_paused: { campaignId, reason }
 * - campaign_resumed: { campaignId }
 *
 * Dashboard Events:
 * - session_paused: { sessionId, sessionName, reason }
 * - session_resumed: { sessionId, sessionName }
 * - session_disconnected: { sessionId, sessionName }
 * - session_connected: { sessionId, sessionName }
 * - health_alert: { sessionId, healthScore, errorCount }
 * - quota_warning: { sessionId, remaining, quota }
 *
 * Global Events:
 * - system_alert: { message, level }
 */

export default {
  campaignSSEHandler,
  dashboardSSEHandler,
  emitToCampaign,
  emitToUser,
  broadcast,
  getConnectionStats
};
