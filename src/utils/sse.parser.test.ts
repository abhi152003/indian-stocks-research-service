import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSSEStream } from './sse.parser';

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();

    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
        },
    });
}

test('parseSSEStream concatenates Prysm output text chunks in order', async () => {
    const stream = createStream([
        'data: {"content":{"message":"Analyzing"},"section":"timeline","type":"status"}\n\n',
        'data: {"content":{"message":"Hel"},"section":"output","type":"text"}\n\n',
        'data: {"content":{"message":"lo"},"section":"output","type":"text"}\n\n',
        'data: {"content":{"message":["ignored"]},"section":"output","type":"related_questions"}\n\n',
    ]);

    const result = await parseSSEStream(stream, 1000);
    assert.equal(result, 'Hello');
});

test('parseSSEStream handles fragmented SSE chunks', async () => {
    const stream = createStream([
        'data: {"content":{"message":"Par',
        'tial"},"section":"output","type":"text"}\n',
        '\n',
        'data: {"content":{"message":" answer"},"section":"output","type":"text"}\n\n',
    ]);

    const result = await parseSSEStream(stream, 1000);
    assert.equal(result, 'Partial answer');
});

test('parseSSEStream fails when stream ends without output text', async () => {
    const stream = createStream([
        'data: {"content":{"message":"Analyzing"},"section":"timeline","type":"status"}\n\n',
    ]);

    await assert.rejects(() => parseSSEStream(stream, 1000), /Stream ended without Prysm output text/);
});

test('parseSSEStream strips provider mentions from final output', async () => {
    const stream = createStream([
        'data: {"content":{"message":"Ask Prysm AI for "},"section":"output","type":"text"}\n\n',
        'data: {"content":{"message":"smallcase IT stocks."},"section":"output","type":"text"}\n\n',
    ]);

    const result = await parseSSEStream(stream, 1000);
    assert.equal(result, 'Ask for IT stocks.');
});
