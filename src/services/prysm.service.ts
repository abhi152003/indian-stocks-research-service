import { config } from '../config/config';
import { logger } from '../utils/logger';
import { TokenExpiredError, PrysmAPIError } from '../utils/errors';
import { parseSSEStream } from '../utils/sse.parser';

export class PrysmService {
    public async ask(question: string, token: string): Promise<string> {
        logger.info('PrysmService: Sending request...', { questionPreview: question.substring(0, 80) });

        try {
            const response = await fetch(config.PRYSM_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({
                    user_input: question,
                    chat_model: 'strategic',
                    with_timeline: true,
                    response_length: 'short',
                    thinking_level: 'fast',
                }),
            });

            if (response.status === 401) {
                throw new TokenExpiredError();
            }

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('PrysmService: API error response', { status: response.status, body: errorText });
                throw new PrysmAPIError(`Prysm API returned status ${response.status}`, response.status);
            }

            if (!response.body) {
                throw new PrysmAPIError('Empty response body from Prysm API');
            }

            const body = response.body as unknown as ReadableStream<Uint8Array>;
            const answer = await parseSSEStream(body, config.QUEUE_TIMEOUT_MS);

            logger.info('PrysmService: Request successful');
            return answer;
        } catch (error: any) {
            if (error instanceof TokenExpiredError || error instanceof PrysmAPIError) {
                throw error;
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            logger.error('PrysmService: Unexpected request failure', { error: errorMessage, stack: errorStack });
            throw new PrysmAPIError(`Network error or unexpected response: ${errorMessage}`);
        }
    }
}

export const prysmService = new PrysmService();
