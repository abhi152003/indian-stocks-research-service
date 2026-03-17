import { Request, Response } from 'express';
import { askQueue, queueEvents } from '../queue/queue';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { CHAT_MODELS, RESPONSE_LENGTHS, THINKING_LEVELS, type ChatModel, type PrysmAskOptions, type ResponseLength, type ThinkingLevel } from '../types/prysm-request';

export const handleAsk = async (req: Request, res: Response) => {
    const { question, chat_model, response_length, thinking_level, chat_uuid } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        return res.status(400).json({ error: 'Question is required and must be a string', code: 'VALIDATION_ERROR' });
    }

    if (!chat_model || typeof chat_model !== 'string' || !CHAT_MODELS.includes(chat_model as ChatModel)) {
        return res.status(400).json({
            error: `chat_model is required and must be one of: ${CHAT_MODELS.join(', ')}`,
            code: 'VALIDATION_ERROR',
        });
    }

    if (!response_length || typeof response_length !== 'string' || !RESPONSE_LENGTHS.includes(response_length as ResponseLength)) {
        return res.status(400).json({
            error: `response_length is required and must be one of: ${RESPONSE_LENGTHS.join(', ')}`,
            code: 'VALIDATION_ERROR',
        });
    }

    if (thinking_level !== undefined) {
        if (chat_model !== 'strategic') {
            return res.status(400).json({
                error: 'thinking_level is only allowed when chat_model is strategic',
                code: 'VALIDATION_ERROR',
            });
        }

        if (typeof thinking_level !== 'string' || !THINKING_LEVELS.includes(thinking_level as ThinkingLevel)) {
            return res.status(400).json({
                error: `thinking_level must be one of: ${THINKING_LEVELS.join(', ')}`,
                code: 'VALIDATION_ERROR',
            });
        }
    }

    if (chat_uuid !== undefined && (typeof chat_uuid !== 'string' || chat_uuid.trim().length === 0)) {
        return res.status(400).json({
            error: 'chat_uuid must be a non-empty string when provided',
            code: 'VALIDATION_ERROR',
        });
    }

    const askOptions: PrysmAskOptions = {
        chatModel: chat_model as ChatModel,
        responseLength: response_length as ResponseLength,
        thinkingLevel: thinking_level as ThinkingLevel | undefined,
        chatUuid: chat_uuid?.trim(),
    };

    try {
        const job = await askQueue.add('ask-job', { question, askOptions });
        logger.info('Controller: Job enqueued', { jobId: job.id, ...askOptions });

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
