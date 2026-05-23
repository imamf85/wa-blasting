import cron from 'node-cron';
import { sendDailySummary } from '../services/report.service.js';
import logger from '../utils/logger.js';

/**
 * Daily Summary Worker
 * Sends daily summary report to admin every day at configured time
 */

// Schedule daily summary
// Default: 6 PM (18:00) every day
// Can be configured via environment variable: DAILY_SUMMARY_HOUR (default: 18)
const summaryHour = process.env.DAILY_SUMMARY_HOUR || '18';

cron.schedule(`0 ${summaryHour} * * *`, async () => {
  logger.info('Triggering daily summary report');

  try {
    const result = await sendDailySummary();

    if (result.success) {
      logger.info('Daily summary sent successfully');
    } else {
      logger.error('Failed to send daily summary', { error: result.error });
    }
  } catch (error) {
    logger.error('Daily summary error', { error: error.message });
  }
});

logger.info('✓ Daily summary worker started', {
  schedule: `Every day at ${summaryHour}:00`
});

// Optional: Send summary on startup (for testing)
if (process.env.NODE_ENV === 'development' && process.env.SEND_SUMMARY_ON_START === 'true') {
  setTimeout(async () => {
    logger.info('Sending test daily summary (development mode)');
    try {
      await sendDailySummary();
    } catch (error) {
      logger.error('Test summary error', { error: error.message });
    }
  }, 10000); // 10 seconds after startup
}

export default {};
