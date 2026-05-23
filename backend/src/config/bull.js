import { Queue } from 'bullmq';
import redis from './redis.js';

// Create queues for different job types
export const messageQueue = new Queue('messages', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000 // 1 minute base delay
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 24 * 3600 // 24 hours
    },
    removeOnFail: {
      count: 5000 // Keep last 5000 failed jobs for debugging
    }
  }
});

export const healthQueue = new Queue('health', {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: {
      count: 100,
      age: 3600 // 1 hour
    }
  }
});

export const reportQueue = new Queue('reports', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000 // 30 seconds
    },
    removeOnComplete: {
      count: 500,
      age: 7 * 24 * 3600 // 7 days
    }
  }
});

console.log('✓ BullMQ queues initialized');

export default { messageQueue, healthQueue, reportQueue };
