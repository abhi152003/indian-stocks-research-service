import { Queue, QueueEvents } from 'bullmq';
import { config } from '../config/config';
import IORedis from 'ioredis';
import { logger } from '../utils/logger';

const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
});

export const askQueue = new Queue('prysm-questions', {
    connection: connection as any,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
    },
});

export const queueEvents = new QueueEvents('prysm-questions', {
    connection: connection as any,
});

logger.info('Queue initialized', { name: 'prysm-questions' });
