import { SSEParseError } from './errors';
import { logger } from './logger';

type PrysmStreamEvent = {
    content?: {
        message?: unknown;
    };
    message_uuid?: string;
    chat_uuid?: string;
    section?: string;
    type?: string;
};

function collectOutputText(dataLine: string, outputChunks: string[]) {
    if (dataLine === '[DONE]') {
        return;
    }

    let parsed: PrysmStreamEvent;

    try {
        parsed = JSON.parse(dataLine) as PrysmStreamEvent;
    } catch (error) {
        logger.error('SSE Parser: Failed to parse JSON line', { line: dataLine, error });
        return;
    }

    if (parsed.section === 'output' && parsed.type === 'text' && typeof parsed.content?.message === 'string') {
        outputChunks.push(parsed.content.message);
        return;
    }

    logger.debug('SSE Parser: Ignoring non-output event', {
        type: parsed.type,
        section: parsed.section,
        messageId: parsed.message_uuid,
        chatId: parsed.chat_uuid,
    });
}

export async function parseSSEStream(
    body: ReadableStream<Uint8Array>,
    timeoutMs: number
): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const outputChunks: string[] = [];
    let accumulated = '';
    const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SSE_TIMEOUT')), timeoutMs)
    );

    try {
        const result = await Promise.race([
            (async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }

                    accumulated += decoder.decode(value, { stream: true });
                    const lines = accumulated.split('\n');
                    accumulated = lines.pop() || '';

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine || !trimmedLine.startsWith('data:')) {
                            continue;
                        }

                        const dataContent = trimmedLine.replace(/^data:\s*/, '');
                        collectOutputText(dataContent, outputChunks);
                    }
                }

                if (accumulated.trim().startsWith('data:')) {
                    const dataContent = accumulated.trim().replace(/^data:\s*/, '');
                    collectOutputText(dataContent, outputChunks);
                }

                const answer = outputChunks.join('');
                if (!answer) {
                    throw new SSEParseError('Stream ended without Prysm output text');
                }

                logger.info('SSE Parser: Assembled Prysm response', { chunkCount: outputChunks.length });
                return answer;
            })(),
            timeoutPromise,
        ]);

        return result;
    } catch (error: any) {
        if (error.message === 'SSE_TIMEOUT') {
            throw new Error('Prysm response timed out');
        }

        throw error;
    } finally {
        reader.releaseLock();
    }
}
