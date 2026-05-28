import { Worker, Queue } from 'bullmq';
import redis from '../config/redis.js';
import supabase from '../config/supabase.js';
import WAHAService from '../services/waha.service.js';
import { renderMessage } from '../services/template.service.js';
import { formatPhoneForWAHA } from '../utils/phoneFormatter.js';
import { emitToCampaign } from '../websocket/sse.js';
import { sendCampaignCompleteReport } from '../services/report.service.js';
import { checkIfNeedsRest, triggerSessionRest } from '../services/health.service.js';
import logger from '../utils/logger.js';

// Initialize message queue for re-queuing
const messageQueue = new Queue('messages', { connection: redis });

/**
 * Message Sender Worker
 * Processes BullMQ jobs and sends messages via WAHA
 */

const worker = new Worker(
  'messages',
  async (job) => {
    const { contactId, sessionId, campaignId } = job.data;

    logger.info('Processing message job', {
      jobId: job.id,
      contactId,
      sessionId,
      campaignId
    });

    try {
      // 1. Get contact, session, and campaign data
      const [contactResult, sessionResult, campaignResult] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', contactId).single(),
        supabase.from('waha_sessions').select('*').eq('id', sessionId).single(),
        supabase.from('campaigns').select('*').eq('id', campaignId).single()
      ]);

      const contact = contactResult.data;
      const session = sessionResult.data;
      const campaign = campaignResult.data;

      if (!contact || !session || !campaign) {
        throw new Error('Contact, session, or campaign not found');
      }

      // 2. Pre-flight checks

      // Check if session is resting - RE-QUEUE job instead of failing
      if (session.is_resting && session.rest_until) {
        const restUntil = new Date(session.rest_until);
        const now = new Date();

        if (restUntil > now) {
          const delayMs = restUntil.getTime() - now.getTime() + 120000; // Add 2 min buffer

          logger.info('Session is resting, re-queuing job with delay', {
            sessionId,
            contactId,
            restUntil: session.rest_until,
            delayMinutes: Math.ceil(delayMs / 60000)
          });

          // Keep contact as 'queued'
          await supabase
            .from('contacts')
            .update({ status: 'queued' })
            .eq('id', contactId);

          // Re-queue job with delay
          await messageQueue.add(
            'send_message',
            { contactId, sessionId, campaignId },
            {
              delay: delayMs,
              removeOnComplete: { count: 100, age: 3600 },
              removeOnFail: { count: 100 }
            }
          );

          logger.info('Job re-queued successfully', {
            contactId,
            sessionId,
            delayMinutes: Math.ceil(delayMs / 60000)
          });

          // Return success (job handled by re-queuing)
          return {
            success: true,
            requeued: true,
            reason: 'session_resting',
            delayMs
          };
        }
      }

      if (session.status !== 'connected') {
        throw new Error(`Session not connected: ${session.status}`);
      }

      if (session.messages_sent_today >= session.daily_quota) {
        throw new Error(`Session daily quota exceeded: ${session.messages_sent_today}/${session.daily_quota}`);
      }

      if (campaign.status !== 'active') {
        throw new Error(`Campaign not active: ${campaign.status}`);
      }

      // 3. Update contact status to 'sending'
      await supabase
        .from('contacts')
        .update({ status: 'sending' })
        .eq('id', contactId);

      // Update message queue status
      await supabase
        .from('message_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString()
        })
        .eq('contact_id', contactId)
        .eq('campaign_id', campaignId);

      logger.info('Pre-flight checks passed, rendering message', {
        contactId,
        sessionId
      });

      // 4. Render message from template
      const renderedMessage = renderMessage(
        campaign.message_template,
        contact,
        campaign.message_variations || []
      );

      logger.debug('Message rendered', {
        contactId,
        messagePreview: renderedMessage.substring(0, 50) + '...'
      });

      // 5. Send via WAHA
      const wahaService = new WAHAService(session);
      const formattedPhone = formatPhoneForWAHA(contact.phone_number);

      let wahaResponse;

      if (campaign.attachment_url) {
        // Send image with caption
        wahaResponse = await wahaService.sendImage({
          chatId: formattedPhone,
          mediaUrl: campaign.attachment_url,
          caption: renderedMessage
        });
      } else {
        // Send text message
        wahaResponse = await wahaService.sendMessage({
          chatId: formattedPhone,
          text: renderedMessage
        });
      }

      logger.info('Message sent successfully', {
        contactId,
        sessionId,
        wahaMessageId: wahaResponse.id
      });

      // 6. Update contact: SUCCESS
      await supabase
        .from('contacts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          waha_message_id: wahaResponse.id,
          final_message: renderedMessage
        })
        .eq('id', contactId);

      // 7. Increment session message counter AND consecutive counter
      await supabase.rpc('increment_session_counter', {
        session_id: sessionId
      });

      // Alternative if RPC doesn't exist: direct update with consecutive counter
      await supabase
        .from('waha_sessions')
        .update({
          messages_sent_today: session.messages_sent_today + 1,
          consecutive_messages_sent: (session.consecutive_messages_sent || 0) + 1,
          last_message_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      // 8. Log delivery
      await supabase
        .from('delivery_logs')
        .insert({
          campaign_id: campaignId,
          contact_id: contactId,
          session_id: sessionId,
          event_type: 'sent',
          waha_response: wahaResponse
        });

      // 9. Update message queue
      await supabase
        .from('message_queue')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('contact_id', contactId)
        .eq('campaign_id', campaignId);

      // 10. Emit SSE event for real-time updates
      emitToCampaign(campaignId, 'message_sent', {
        contactId,
        contactName: contact.name,
        contactPhone: contact.phone_number,
        sessionId,
        wahaMessageId: wahaResponse.id
      });

      // 11. Check if session needs to rest (after successful send)
      const restCheck = await checkIfNeedsRest(sessionId);
      if (restCheck.needsRest && !restCheck.error) {
        logger.info('Session needs rest after sending messages', {
          sessionId,
          consecutiveSent: restCheck.consecutiveSent,
          reason: restCheck.reason
        });

        // Trigger resting period (async, don't wait)
        triggerSessionRest(sessionId, restCheck.reason).catch(error => {
          logger.error('Failed to trigger session rest', {
            sessionId,
            error: error.message
          });
        });
      }

      // 12. Check if campaign is complete
      await checkCampaignCompletion(campaignId);

      logger.info('Message job completed successfully', {
        jobId: job.id,
        contactId,
        sessionId,
        consecutiveMessagesSent: (session.consecutive_messages_sent || 0) + 1
      });

      return {
        success: true,
        contactId,
        sessionId,
        wahaMessageId: wahaResponse.id
      };

    } catch (error) {
      logger.error('Message job failed', {
        jobId: job.id,
        contactId,
        sessionId,
        error: error.message,
        stack: error.stack
      });

      // Handle failure
      await handleMessageFailure(contactId, sessionId, campaignId, error);

      // Re-throw error for BullMQ retry mechanism
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1, // Process 1 job at a time (safer for anti-ban)
    limiter: {
      max: 5, // Max 5 jobs per duration (reduced from 10)
      duration: 60000 // Per minute (global rate limiting)
    }
  }
);

/**
 * Handle message sending failure
 */
async function handleMessageFailure(contactId, sessionId, campaignId, error) {
  try {
    // Update contact status to 'failed'
    const { data: contact } = await supabase
      .from('contacts')
      .select('retry_count, name, phone_number')
      .eq('id', contactId)
      .single();

    await supabase
      .from('contacts')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: error.message,
        retry_count: (contact?.retry_count || 0) + 1
      })
      .eq('id', contactId);

    // Increment session error counter
    await supabase
      .from('waha_sessions')
      .update({
        error_count_today: supabase.raw('error_count_today + 1'),
        last_error_at: new Date().toISOString()
      })
      .eq('id', sessionId);

    // Log delivery failure
    await supabase
      .from('delivery_logs')
      .insert({
        campaign_id: campaignId,
        contact_id: contactId,
        session_id: sessionId,
        event_type: 'failed',
        error_message: error.message
      });

    // Update message queue
    await supabase
      .from('message_queue')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
      .eq('contact_id', contactId)
      .eq('campaign_id', campaignId);

    // Emit SSE event for real-time updates
    emitToCampaign(campaignId, 'message_failed', {
      contactId,
      contactName: contact?.name,
      contactPhone: contact?.phone_number,
      sessionId,
      error: error.message
    });

    logger.info('Message failure recorded', {
      contactId,
      sessionId,
      error: error.message
    });
  } catch (handleError) {
    logger.error('Failed to handle message failure', {
      contactId,
      error: handleError.message
    });
  }
}

/**
 * Check if campaign has completed
 * If all contacts are sent or failed, mark campaign as complete
 */
async function checkCampaignCompletion(campaignId) {
  try {
    // Get campaign stats
    const { data: contacts } = await supabase
      .from('contacts')
      .select('status')
      .eq('campaign_id', campaignId);

    if (!contacts || contacts.length === 0) {
      return;
    }

    const statuses = contacts.map(c => c.status);
    const allProcessed = statuses.every(s =>
      s === 'sent' || s === 'failed'
    );

    if (allProcessed) {
      // All contacts processed - complete the campaign
      const { data: campaign } = await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', campaignId)
        .select('name')
        .single();

      const sentCount = statuses.filter(s => s === 'sent').length;
      const failedCount = statuses.filter(s => s === 'failed').length;

      logger.info('Campaign completed', {
        campaignId,
        totalContacts: contacts.length,
        sent: sentCount,
        failed: failedCount
      });

      // Emit SSE event for campaign completion
      emitToCampaign(campaignId, 'campaign_completed', {
        campaignName: campaign?.name,
        stats: {
          total: contacts.length,
          sent: sentCount,
          failed: failedCount,
          successRate: ((sentCount / contacts.length) * 100).toFixed(1)
        }
      });

      // Send completion report to admin
      sendCampaignCompleteReport(campaignId).catch(error => {
        logger.error('Failed to send campaign completion report', {
          campaignId,
          error: error.message
        });
      });
    }
  } catch (error) {
    logger.error('Failed to check campaign completion', {
      campaignId,
      error: error.message
    });
  }
}

// Worker event handlers
worker.on('completed', (job, result) => {
  logger.info('Job completed', {
    jobId: job.id,
    contactId: job.data.contactId,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Job failed', {
    jobId: job?.id,
    contactId: job?.data?.contactId,
    error: error.message,
    attemptsMade: job?.attemptsMade,
    attemptsMax: job?.opts?.attempts
  });
});

worker.on('error', (error) => {
  logger.error('Worker error', { error: error.message });
});

worker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});

logger.info('✓ Message sender worker started', {
  queue: 'messages',
  concurrency: 5
});

export default worker;
