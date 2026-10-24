import { describe, expect, it } from '@jest/globals';
import { parseSseEventStream, parseSseTextStream } from './sse-stream.util.js';

const streamOf = (...chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
};
const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
};

describe('parseSseTextStream', () => {
  it('reads LF frames', async () => {
    expect(await collect(parseSseTextStream(streamOf('data: {"a":1}\n\ndata: {"a":2}\n\n')))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('reads CRLF frames (Gemini): they used to read as an empty stream', async () => {
    expect(await collect(parseSseTextStream(streamOf('data: {"a":1}\r\n\r\ndata: {"a":2}\r\n\r\n')))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('survives a chunk boundary between the CR and the LF', async () => {
    expect(await collect(parseSseTextStream(streamOf('data: {"a":1}\r', '\n\r', '\ndata: {"a":2}\r\n\r\n')))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('keeps passing the [DONE] sentinel through', async () => {
    expect(await collect(parseSseTextStream(streamOf('data: [DONE]\n\n')))).toEqual(['[DONE]']);
  });
});

describe('parseSseEventStream', () => {
  it('keeps the event name, with CRLF too', async () => {
    expect(await collect(parseSseEventStream(streamOf('event: content_block_delta\r\ndata: {"x":1}\r\n\r\n')))).toEqual([
      { event: 'content_block_delta', data: '{"x":1}' },
    ]);
  });
});
