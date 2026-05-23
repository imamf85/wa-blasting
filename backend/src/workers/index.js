import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load environment variables
dotenv.config();

// Import workers
import messageSenderWorker from './message-sender.worker.js';
import healthCheckWorker from './health-check.worker.js';
import './daily-summary.worker.js';

logger.info('🚀 Workers starting...');
logger.info('Environment:', process.env.NODE_ENV || 'development');

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down workers gracefully...');

  await Promise.all([
    messageSenderWorker.close(),
    healthCheckWorker.close()
  ]);

  logger.info('All workers closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down workers gracefully...');

  await Promise.all([
    messageSenderWorker.close(),
    healthCheckWorker.close()
  ]);

  logger.info('All workers closed');
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception in worker', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection in worker', {
    reason,
    promise
  });
  process.exit(1);
});

logger.info('✓ All workers started successfully');
logger.info('Workers ready to process jobs');

// Keep the process alive
setInterval(() => {
  // Optional: Log worker health status
  logger.debug('Workers health check', {
    timestamp: new Date().toISOString()
  });
}, 60000); // Every minute
