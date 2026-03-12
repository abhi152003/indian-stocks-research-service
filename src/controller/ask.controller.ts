import { Request, Response } from 'express';
import { askQueue, queueEvents } from '../queue/queue';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export const handleAsk = async (req: Request, res: Response) => {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({ error: 'Question is required and must be a string', code: 'VALIDATION_ERROR' });
    }

    try {
        const job = await askQueue.add('ask-job', { question });
        logger.info('Controller: Job enqueued', { jobId: job.id });

        try {
            const result = await job.waitUntilFinished(queueEvents, config.QUEUE_TIMEOUT_MS);
            return res.json({ answer: result.answer });
        } catch (err: any) {
            if (err.message.includes('timeout')) {
                logger.error('Controller: Job timed out', { jobId: job.id });
                return res.status(504).json({ error: 'Prysm response timed out', code: 'TIMEOUT' });
            }
            throw err;
        }
    } catch (error: any) {
        logger.error('Controller: Job handling failed', { error: error.message });
        const statusCode = error.statusCode || 502;
        const code = error.code || 'PRYSM_ERROR';
        return res.status(statusCode).json({ error: error.message, code });
    }
};
