import express from 'express';
import askRoutes from '../routes/ask.route';
import { logger } from '../utils/logger';

export const createApp = () => {
    const app = express();

    app.use(express.json());

    app.use('/research', askRoutes);

    return app;
};

export const startServer = (app: express.Application, port: number) => {
    return app.listen(port, () => {
        logger.info(`Server started on port ${port}`, { url: `http://localhost:${port}` });
    });
};
