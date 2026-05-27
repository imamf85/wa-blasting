import { Worker } from 'bullmq';
import cron from 'node-cron';
import redis from '../config/redis.js';
import { healthQueue } from '../config/bull.js';
import { checkAllSessions, resetDailyCounters, autoResumeRestingSessions } from '../services/health.service.js';
import logger from '../utils/logger.js';

/**
 * Health Check Worker
 * Periodically checks session health and resets daily counters
 */

// Worker to process health check jobs
const worker = new Worker(
  'health',
  async (job) => {
    const { type } = job.data;

    logger.info('Processing health check job', { jobId: job.id, type });

    try {
      if (type === 'check_all_sessions') {
        // Check health of all sessions
        const result = await checkAllSessions();

        logger.info('Health check completed', {
          totalChecked: result.totalChecked,
          autoPaused: result.autoPaused,
          avgHealthScore: result.avgHealthScore
        });

        return result;
      } else if (type === 'reset_daily_counters') {
        // Reset daily counters (called at midnight)
        const result = await resetDailyCounters();

        logger.info('Daily counters reset', {
          resumedSessions: result.resumedSessions
        });

        return result;
      } else if (type === 'auto_resume_resting') {
        // Auto-resume sessions whose rest period has ended
        const result = await autoResumeRestingSessions();

        logger.info('Auto-resume resting sessions completed', {
          resumedCount: result.resumedCount,
          sessions: result.sessions
        });

        return result;
      }

      return { success: true };
    } catch (error) {
      logger.error('Health check job failed', {
        jobId: job.id,
        type,
        error: error.message
      });
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1 // Process health checks one at a time
  }
);

// Worker event handlers
worker.on('completed', (job, result) => {
  logger.info('Health check job completed', {
    jobId: job.id,
    type: job.data.type,
    result
  });
});

worker.on('failed', (job, error) => {
  logger.error('Health check job failed', {
    jobId: job?.id,
    type: job?.data?.type,
    error: error.message
  });
});

worker.on('error', (error) => {
  logger.error('Health check worker error', { error: error.message });
});

// Schedule periodic health checks
// Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  logger.debug('Triggering scheduled health check');

  try {
    await healthQueue.add(
      'check_all_sessions',
      { type: 'check_all_sessions' },
      {
        removeOnComplete: {
          count: 100,
          age: 3600 // 1 hour
        }
      }
    );
  } catch (error) {
    logger.error('Failed to schedule health check', { error: error.message });
  }
});

// Schedule daily reset at midnight
// 00:00 every day
cron.schedule('0 0 * * *', async () => {
  logger.info('Triggering daily counter reset');

  try {
    await healthQueue.add(
      'reset_daily_counters',
      { type: 'reset_daily_counters' },
      {
        removeOnComplete: {
          count: 30,
          age: 7 * 24 * 3600 // 7 days
        }
      }
    );
  } catch (error) {
    logger.error('Failed to schedule daily reset', { error: error.message });
  }
});

// Schedule auto-resume check for resting sessions
// Every 2 minutes (check if any session's rest period has ended)
cron.schedule('*/2 * * * *', async () => {
  logger.debug('Triggering auto-resume check for resting sessions');

  try {
    await healthQueue.add(
      'auto_resume_resting',
      { type: 'auto_resume_resting' },
      {
        removeOnComplete: {
          count: 100,
          age: 3600 // 1 hour
        }
      }
    );
  } catch (error) {
    logger.error('Failed to schedule auto-resume check', { error: error.message });
  }
});

logger.info('✓ Health check worker started', {
  queue: 'health',
  schedules: [
    'Health check: Every 5 minutes',
    'Daily reset: Every day at 00:00',
    'Auto-resume resting sessions: Every 2 minutes'
  ]
});

// Optional: Run initial health check on startup (after 30 seconds)
setTimeout(async () => {
  logger.info('Running initial health check');
  try {
    await healthQueue.add('check_all_sessions', { type: 'check_all_sessions' });
  } catch (error) {
    logger.error('Failed to run initial health check', { error: error.message });
  }
}, 30000);

export default worker;
