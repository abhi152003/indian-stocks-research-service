import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
    PORT: parseInt(process.env.PORT || '3000', 10),
    API_KEY: process.env.API_KEY || '',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    HEADLESS: process.env.HEADLESS !== 'false',
    CHROMIUM_SANDBOX: process.env.CHROMIUM_SANDBOX !== 'false',
    BROWSER_CHANNEL: process.env.BROWSER_CHANNEL || 'chrome',
    PRYSM_CHAT_URL: process.env.PRYSM_CHAT_URL || 'https://www.prysm.fi/',
    PRYSM_API_URL: process.env.PRYSM_API_URL || 'https://api-agents.prysm.fi/ai/chat/stream/v2/',
    QUEUE_CONCURRENCY: parseInt(process.env.QUEUE_CONCURRENCY || '3', 10),
    QUEUE_TIMEOUT_MS: parseInt(process.env.QUEUE_TIMEOUT_MS || '60000', 10),
    PROFILE_PATH: process.env.PROFILE_PATH || path.join(process.cwd(), 'session', 'prysm-profile'),
};

if (!config.API_KEY) {
    console.warn('WARNING: API_KEY is not set in .env');
}
