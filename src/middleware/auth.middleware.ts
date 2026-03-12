import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';
import { logger } from '../utils/logger';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        logger.warn('AuthMiddleware: Missing x-api-key header');
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    if (apiKey !== config.API_KEY) {
        logger.warn('AuthMiddleware: Invalid API key', { received: apiKey, expected: '***' });
        return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    next();
};
