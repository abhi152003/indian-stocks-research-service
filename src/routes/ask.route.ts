import { Router } from 'express';
import { handleAsk } from '../controller/ask.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { tokenManager } from '../browser/token.manager';

const router = Router();

router.post('/ask', authMiddleware, handleAsk);

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        browser: tokenManager.isReady() ? 'connected' : 'disconnected',
        provider: 'prysm',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

export default router;
