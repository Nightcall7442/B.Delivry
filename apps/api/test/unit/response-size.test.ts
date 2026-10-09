/**
 * Smaller answers for a bad connection: a repeat of an unchanged GET is a 304 with no body, and
 * what is sent is compressed. Real Fastify, no database.
 */
import { gunzipSync } from 'node:zlib';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import {
  etagOf,
  matchesIfNoneMatch,
  registerResponseSize,
} from '../../src/middleware/response-size.middleware.js';

// What a stall's order list looks like: a lot of repeated keys, which is why JSON compresses well.
const orders = (count: number, suffix = '') => ({
  ok: true,
  data: Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    status: 'CONFIRMED',
    storeName: { ru: 'Мясная лавка «Фархад»', uz: 'Farhod goʻsht doʻkoni', en: 'Farhad meat' },
    note: suffix,
  })),
});

let app: FastifyInstance;
let body: unknown = orders(40);

async function start(): Promise<FastifyInstance> {
  app = Fastify();
  await registerResponseSize(app);
  app.get('/list', async () => body);
  app.get('/tiny', async () => ({ ok: true }));
  app.get('/own-policy', async (_request, reply) => {
    void reply.header('cache-control', 'public, max-age=60');
    return body;
  });
  app.post('/list', async () => body);
  await app.ready();
  return app;
}

afterEach(async () => {
  body = orders(40);
  await app?.close();
});

describe('conditional GET', () => {
  it('tags a JSON answer, and keeps it out of shared caches', async () => {
    await start();
    const res = await app.inject({ url: '/list', headers: { 'accept-encoding': 'identity' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBe(etagOf(res.body));
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('answers «same as before» with no body when the tag comes back', async () => {
    await start();
    const first = await app.inject({ url: '/list', headers: { 'accept-encoding': 'identity' } });
    const again = await app.inject({
      url: '/list',
      headers: { 'if-none-match': String(first.headers.etag), 'accept-encoding': 'identity' },
    });
    expect(again.statusCode).toBe(304);
    expect(again.body).toBe('');
    expect(again.headers['content-length']).toBeUndefined();
    expect(again.headers.etag).toBe(first.headers.etag);
  });

  it('sends the whole list again once it has changed', async () => {
    await start();
    const first = await app.inject({ url: '/list', headers: { 'accept-encoding': 'identity' } });
    body = orders(41);
    const changed = await app.inject({
      url: '/list',
      headers: { 'if-none-match': String(first.headers.etag), 'accept-encoding': 'identity' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.etag).not.toBe(first.headers.etag);
    expect(JSON.parse(changed.body).data).toHaveLength(41);
  });

  it('means the same thing whichever encoding the client asked for', async () => {
    await start();
    const plain = await app.inject({ url: '/list', headers: { 'accept-encoding': 'identity' } });
    const gz = await app.inject({ url: '/list', headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers.etag).toBe(plain.headers.etag);
    // …so a client that learned the tag from one can use it on the other, and still gets a 304.
    const again = await app.inject({
      url: '/list',
      headers: { 'if-none-match': String(plain.headers.etag), 'accept-encoding': 'gzip' },
    });
    expect(again.statusCode).toBe(304);
  });

  it('leaves small answers, writes and a handler’s own cache policy alone', async () => {
    await start();
    const tiny = await app.inject({ url: '/tiny' });
    expect(tiny.headers.etag).toBeUndefined();
    const write = await app.inject({ method: 'POST', url: '/list' });
    expect(write.headers.etag).toBeUndefined();
    const own = await app.inject({
      url: '/own-policy',
      headers: { 'accept-encoding': 'identity' },
    });
    expect(own.headers['cache-control']).toBe('public, max-age=60');
    expect(own.headers.etag).toBeDefined();
  });

  it('matches a list of tags, weak or strong, and the wildcard', () => {
    const tag = 'W/"abc"';
    expect(matchesIfNoneMatch('W/"abc"', tag)).toBe(true);
    expect(matchesIfNoneMatch('"abc"', tag)).toBe(true);
    expect(matchesIfNoneMatch('"zzz", W/"abc"', tag)).toBe(true);
    expect(matchesIfNoneMatch('*', tag)).toBe(true);
    expect(matchesIfNoneMatch('W/"other"', tag)).toBe(false);
    expect(matchesIfNoneMatch(undefined, tag)).toBe(false);
  });
});

describe('compression', () => {
  it('gzips a list for a client that accepts it, five times smaller or better', async () => {
    await start();
    const plain = await app.inject({ url: '/list', headers: { 'accept-encoding': 'identity' } });
    const gz = await app.inject({ url: '/list', headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gz.headers.vary).toMatch(/accept-encoding/i);
    expect(gz.rawPayload.length * 5).toBeLessThan(plain.rawPayload.length);
    expect(gunzipSync(gz.rawPayload).toString()).toBe(plain.body);
  });

  it('prefers brotli when the client offers it', async () => {
    await start();
    const res = await app.inject({ url: '/list', headers: { 'accept-encoding': 'gzip, br' } });
    expect(res.headers['content-encoding']).toBe('br');
  });

  it('does not bother with a body that is already small', async () => {
    await start();
    const res = await app.inject({ url: '/tiny', headers: { 'accept-encoding': 'gzip' } });
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});
