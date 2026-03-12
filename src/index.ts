import { config } from './config/config';
import { logger } from './utils/logger';
import { tokenManager } from './browser/token.manager';
import { setupWorker } from './workers/prysm.worker';
import { createApp, startServer } from './server/server';
import { askQueue } from './queue/queue';

async function bootstrap() {
    try {
        logger.info('Starting Indian stock research service...');

        // 1. Initialize Token Manager (Playwright)
        await tokenManager.initialize();

        // 2. Setup BullMQ Worker
        const worker = setupWorker();

        // 3. Create and Start Express Server
        const app = createApp();
        const server = startServer(app, config.PORT);

        // Graceful Shutdown
        const shutdown = async (signal: string) => {
            logger.info(`${signal} received. Shutting down gracefully...`);

            server.close(() => {
                logger.info('HTTP server closed.');
            });

            await worker.close();
            logger.info('BullMQ worker closed.');

            await askQueue.close();
            logger.info('BullMQ queue closed.');

            await tokenManager.shutdown();
            logger.info('Browser context closed.');

            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

    } catch (error) {
        logger.error('Failed to start service', { error });
        process.exit(1);
    }
}

bootstrap();
