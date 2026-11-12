import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { convert, convertStream, lookup, services, ApiError } from './client';

const CACHE_MISS = { hit: false, ttl_seconds: 0 };

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api client', () => {
  it('convert returns response on 200', async () => {
    let capturedUrlParam: string | null = null;
    server.use(
      http.get('*/api/v1/convert', ({ request }) => {
        capturedUrlParam = new URL(request.url).searchParams.get('url');
        return HttpResponse.json({
          source: { service: 'tidal' },
          targets: {},
          cache: CACHE_MISS
        });
      })
    );
    const res = await convert('https://example.com/track/1');
    expect(capturedUrlParam).toBe('https://example.com/track/1');
    expect(res.source.service).toBe('tidal');
    expect(res.cache.hit).toBe(false);
  });

  it('convert throws ApiError with mapped code on 400', async () => {
    server.use(
      http.get('*/api/v1/convert', () =>
        HttpResponse.json({ code: 'invalid_url', message: 'bad' }, { status: 400 })
      )
    );
    await expect(convert('https://bad')).rejects.toMatchObject({
      name: 'ApiError',
      code: 'invalid_url',
      status: 400
    });
  });

  it('convert throws ApiError offline on network exception', async () => {
    server.use(http.get('*/api/v1/convert', () => HttpResponse.error()));
    await expect(convert('https://x')).rejects.toMatchObject({ code: 'offline' });
  });

  it('convert passes share=true', async () => {
    let capturedShareParam: string | null = null;
    server.use(
      http.get('*/api/v1/convert', ({ request }) => {
        capturedShareParam = new URL(request.url).searchParams.get('share');
        return HttpResponse.json({
          source: {},
          targets: {},
          cache: CACHE_MISS,
          share: { id: 'ab3x9k' }
        });
      })
    );
    await convert('https://x', { share: true });
    expect(capturedShareParam).toBe('true');
  });

  it('convert propagates AbortError without wrapping', async () => {
    const abort = new DOMException('Aborted', 'AbortError');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(abort);
    await expect(convert('https://x')).rejects.toMatchObject({ name: 'AbortError' });
    fetchSpy.mockRestore();
  });

  it('lookup GETs /c/<id>', async () => {
    server.use(
      http.get('*/api/v1/c/ab3x9k', () =>
        HttpResponse.json({
          source: { service: 'spotify' },
          targets: {},
          cache: { hit: true, ttl_seconds: 300 }
        })
      )
    );
    const res = await lookup('ab3x9k');
    expect(res.source.service).toBe('spotify');
  });

  it('lookup 404 maps to not_found code', async () => {
    server.use(
      http.get('*/api/v1/c/missing', () =>
        HttpResponse.json({ code: 'not_found', message: 'nope' }, { status: 404 })
      )
    );
    await expect(lookup('missing')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('services returns list', async () => {
    server.use(
      http.get('*/api/v1/services', () =>
        HttpResponse.json({
          services: [{ id: 'spotify', name: 'Spotify', capabilities: ['track'] }]
        })
      )
    );
    const res = await services();
    expect(res.services).toHaveLength(1);
    expect(res.services[0]).toMatchObject({ id: 'spotify', name: 'Spotify' });
  });

  describe('convertStream', () => {
    const source = { service: 'tidal', type: 'track', id: '1', url: 'https://tidal/1', title: 'N', artists: [], artwork: '' };
    const done = { source, targets: { spotify: { status: 'ok', url: 'https://sp/1' } }, cache: CACHE_MISS };

    function sse(chunks: string[]): Response {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      });
      return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
    }

    const event = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

    it('reports source and targets as they arrive and resolves with the result', async () => {
      const text =
        event('source', { source, pending: ['spotify'] }) +
        event('target', { service: 'spotify', result: { status: 'ok', url: 'https://sp/1' } }) +
        event('done', done);
      // Cut in the middle of an event: network chunks do not respect event borders.
      server.use(http.get('*/api/v1/convert/stream', () => sse([text.slice(0, 40), text.slice(40, 97), text.slice(97)])));
      const seen: string[] = [];
      const res = await convertStream('https://tidal/1', {
        onSource: (s, pending) => seen.push(`source:${s.title}:${pending.join()}`),
        onTarget: (service, result) => seen.push(`target:${service}:${result.status}`)
      });
      expect(seen).toEqual(['source:N:spotify', 'target:spotify:ok']);
      expect(res).toEqual(done);
    });

    it('throws the same errors as convert when the stream does not start', async () => {
      server.use(
        http.get('*/api/v1/convert/stream', () =>
          HttpResponse.json({ error: { code: 'unsupported_service', message: 'nope' } }, { status: 400 })
        )
      );
      await expect(convertStream('https://x/1')).rejects.toMatchObject({
        code: 'unsupported_service',
        status: 400,
        sourceUrl: 'https://x/1'
      });
    });

    it('falls back to the plain conversion when the backend has no stream route yet', async () => {
      server.use(
        http.get('*/api/v1/convert/stream', () =>
          HttpResponse.json({ detail: 'Not Found' }, { status: 404 })
        ),
        http.get('*/api/v1/convert', () => HttpResponse.json(done))
      );
      expect(await convertStream('https://tidal/1')).toEqual(done);
    });

    it('does not fall back when the item itself was not found', async () => {
      server.use(
        http.get('*/api/v1/convert/stream', () =>
          HttpResponse.json({ error: { code: 'source_unavailable', message: 'gone' } }, { status: 404 })
        )
      );
      await expect(convertStream('https://tidal/1')).rejects.toMatchObject({ status: 404 });
    });

    it('fails when the stream ends before the result', async () => {
      server.use(
        http.get('*/api/v1/convert/stream', () => sse([event('source', { source, pending: [] })]))
      );
      await expect(convertStream('https://tidal/1')).rejects.toBeInstanceOf(ApiError);
    });
  });
});
