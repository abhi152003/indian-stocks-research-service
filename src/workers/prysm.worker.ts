import { Worker, Job } from 'bullmq';
import { config } from '../config/config';
import { prysmService } from '../services/prysm.service';
import { tokenManager } from '../browser/token.manager';
import { logger } from '../utils/logger';
import { TokenExpiredError } from '../utils/errors';
import IORedis from 'ioredis';
import { type PrysmAskOptions } from '../types/prysm-request';

const connection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
});

export function setupWorker() {
    const worker = new Worker(
        'prysm-questions',
        async (job: Job) => {
            const { question, askOptions } = job.data as { question: string; askOptions: PrysmAskOptions };
            logger.info('Worker: Processing job', {
                jobId: job.id,
                question: question.substring(0, 50),
                ...askOptions,
            });

            let token = tokenManager.getToken();
            if (!token) {
                logger.info('Worker: No token available, requesting initial extraction...');
                token = await tokenManager.refreshToken();
            }

            try {
                const answer = await prysmService.ask(question, token, askOptions);
                return { answer };
            } catch (error) {
                if (error instanceof TokenExpiredError) {
                    logger.warn('Worker: Token expired, refreshing and retrying once...', { jobId: job.id });
                    const newToken = await tokenManager.refreshToken();
                    const answer = await prysmService.ask(question, newToken, askOptions);
                    return { answer };
                }
                throw error;
            }
        },
        {
            connection: connection as any,
            concurrency: config.QUEUE_CONCURRENCY,
        }
    );

    worker.on('completed', (job) => {
        logger.info('Worker: Job completed', { jobId: job.id });
    });

    worker.on('failed', (job, err) => {
        logger.error('Worker: Job failed', { jobId: job?.id, error: err.message });
    });

    return worker;
}
