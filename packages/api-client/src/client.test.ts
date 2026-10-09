import { describe, expect, it, vi } from 'vitest';

import { Http } from './client.js';
import { ApiError } from './errors.js';
import type { Tokens } from './types.js';

function memoryTokens(initial: Tokens | null) {
  let current = initial;
  return {
    get: () => current,
    set: (next: Tokens | null) => {
      current = next;
    },
    peek: () => current,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Http', () => {
  it('unwraps the envelope and sends auth, locale and tenant headers', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true, data: { id: 's1' } }));
    const http = new Http({
      baseUrl: 'http://api/api/v1/',
      tokens: memoryTokens({ accessToken: 'A', refreshToken: 'R' }),
      locale: () => 'uz',
      tenant: 'tashkent',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const data = await http.request<{ id: string }>('GET', '/stores/s1', {
      query: { page: 2, empty: undefined },
    });

    expect(data).toEqual({ id: 's1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/api/v1/stores/s1?page=2');
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer A');
    expect(headers['x-locale']).toBe('uz');
    expect(headers['x-tenant']).toBe('tashkent');
  });

  it('refreshes once on 401, stores the new pair and retries the original call', async () => {
    const tokens = memoryTokens({ accessToken: 'old', refreshToken: 'R' });
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>)['authorization'];
      if (url.endsWith('/auth/refresh')) {
        return json(200, {
          ok: true,
          data: { accessToken: 'new', refreshToken: 'R2', expiresIn: 900 },
        });
      }
      if (auth === 'Bearer old') {
        return json(401, { ok: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } });
      }
      return json(200, { ok: true, data: 'fresh' });
    });
    const http = new Http({
      baseUrl: 'http://api',
      tokens,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(http.request('GET', '/customers/me')).resolves.toBe('fresh');
    expect(tokens.peek()).toEqual({ accessToken: 'new', refreshToken: 'R2' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('signs out when the refresh itself is rejected', async () => {
    const tokens = memoryTokens({ accessToken: 'old', refreshToken: 'dead' });
    const onSignedOut = vi.fn();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/auth/refresh')
        ? json(401, { ok: false, error: { code: 'TOKEN_INVALID', message: 'nope' } })
        : json(401, { ok: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
    );
    const http = new Http({
      baseUrl: 'http://api',
      tokens,
      onSignedOut,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(http.request('GET', '/customers/me')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
      status: 401,
    });
    expect(tokens.peek()).toBeNull();
    expect(onSignedOut).toHaveBeenCalledOnce();
  });

  it('turns a dead network and a non-envelope body into ApiError', async () => {
    const dead = new Http({
      baseUrl: 'http://api',
      tokens: memoryTokens(null),
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as unknown as typeof fetch,
    });
    await expect(dead.request('GET', '/x')).rejects.toBeInstanceOf(ApiError);
    await expect(dead.request('GET', '/x')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });

    const html = new Http({
      baseUrl: 'http://api',
      tokens: memoryTokens(null),
      fetch: (async () =>
        new Response('<html>502</html>', { status: 502 })) as unknown as typeof fetch,
    });
    await expect(html.request('GET', '/x')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      status: 502,
    });
  });
});

describe('Http with nothing to read', () => {
  const answering = (make: () => Response, tokens = memoryTokens(null)) =>
    new Http({
      baseUrl: 'http://api',
      tokens,
      fetch: (async () => make()) as unknown as typeof fetch,
    });

  it('resolves a 204 as undefined: the write went through', async () => {
    const http = answering(() => new Response(null, { status: 204 }));
    await expect(http.request<void>('PUT', '/products/p1/availability')).resolves.toBeUndefined();
  });

  it('resolves an empty 2xx body as undefined too', async () => {
    for (const body of ['', ' \n ']) {
      const http = answering(() => new Response(body, { status: 200 }));
      await expect(http.request<void>('DELETE', '/cart/s1')).resolves.toBeUndefined();
    }
  });

  it('keeps MALFORMED_RESPONSE for a body that is there but is not the envelope', async () => {
    for (const body of ['<html>gateway</html>', 'OK', '{"id":"s1"}', 'null', '[]']) {
      const http = answering(() => new Response(body, { status: 200 }));
      await expect(http.request('GET', '/stores/s1')).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
        status: 200,
      });
    }
  });

  it('keeps MALFORMED_RESPONSE for a failure with no body: nothing says what went wrong', async () => {
    const http = answering(() => new Response('', { status: 502 }));
    await expect(http.request('GET', '/x')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      status: 502,
    });
  });

  it('still unwraps a normal envelope, and still throws the API’s own error', async () => {
    const ok = answering(() => json(200, { ok: true, data: { id: 's1' } }));
    await expect(ok.request('GET', '/stores/s1')).resolves.toEqual({ id: 's1' });

    const empty = answering(() => json(200, { ok: true, data: null }));
    await expect(empty.request('GET', '/x')).resolves.toBeNull();

    const refused = answering(() =>
      json(422, { ok: false, error: { code: 'VALIDATION', message: 'bad' } }),
    );
    await expect(refused.request('PUT', '/x')).rejects.toMatchObject({
      code: 'VALIDATION',
      status: 422,
    });
  });

  it('a list that answers with no body is malformed, not an empty list', async () => {
    const http = answering(() => new Response(null, { status: 204 }));
    await expect(http.paginated('/stores')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
      status: 204,
    });
  });

  it('resolves a 204 that follows a token refresh', async () => {
    const tokens = memoryTokens({ accessToken: 'old', refreshToken: 'R' });
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/refresh'))
        return json(200, {
          ok: true,
          data: { accessToken: 'new', refreshToken: 'R2', expiresIn: 900 },
        });
      const auth = (init.headers as Record<string, string>)['authorization'];
      return auth === 'Bearer old'
        ? json(401, { ok: false, error: { code: 'TOKEN_EXPIRED', message: 'expired' } })
        : new Response(null, { status: 204 });
    });
    const http = new Http({
      baseUrl: 'http://api',
      tokens,
      fetch: fetchMock as unknown as typeof fetch,
    });

    await expect(http.request<void>('DELETE', '/cart/s1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('Http.renew', () => {
  const refreshed = () =>
    json(200, { ok: true, data: { accessToken: 'new', refreshToken: 'R2', expiresIn: 900 } });

  const setup = (initial: Tokens | null) => {
    const tokens = memoryTokens(initial);
    const onSignedOut = vi.fn();
    const fetchMock = vi.fn(async () => refreshed());
    const http = new Http({
      baseUrl: 'http://api',
      tokens,
      onSignedOut,
      fetch: fetchMock as unknown as typeof fetch,
    });
    return { http, tokens, onSignedOut, fetchMock };
  };

  /** The refresh token a refresh call spent. */
  const spent = (fetchMock: ReturnType<typeof setup>['fetchMock']) =>
    fetchMock.mock.calls.map((call) => {
      const [url, init] = call as unknown as [string, RequestInit];
      return { url, body: JSON.parse(String(init.body)) as unknown };
    });

  it('hands back the pair the store already holds, and spends no refresh token, when the caller’s token is stale', async () => {
    // Another window of the same browser renewed first: the store has moved on from "A".
    const { http, tokens, onSignedOut, fetchMock } = setup({
      accessToken: 'B',
      refreshToken: 'R-B',
    });

    await expect(http.renew('A')).resolves.toEqual({ accessToken: 'B', refreshToken: 'R-B' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(tokens.peek()).toEqual({ accessToken: 'B', refreshToken: 'R-B' });
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it('refreshes when the stored token is still the stale one', async () => {
    const { http, tokens, fetchMock } = setup({ accessToken: 'A', refreshToken: 'R' });

    await expect(http.renew('A')).resolves.toEqual({ accessToken: 'new', refreshToken: 'R2' });

    expect(spent(fetchMock)).toEqual([
      { url: 'http://api/auth/refresh', body: { refreshToken: 'R' } },
    ]);
    expect(tokens.peek()).toEqual({ accessToken: 'new', refreshToken: 'R2' });
  });

  it('refreshes as before when it is not told which token is stale', async () => {
    const { http, tokens, fetchMock } = setup({ accessToken: 'B', refreshToken: 'R-B' });

    await expect(http.renew()).resolves.toEqual({ accessToken: 'new', refreshToken: 'R2' });

    expect(spent(fetchMock)).toEqual([
      { url: 'http://api/auth/refresh', body: { refreshToken: 'R-B' } },
    ]);
    expect(tokens.peek()).toEqual({ accessToken: 'new', refreshToken: 'R2' });
  });

  it('two windows told at once spend the refresh token once: the second finds the new pair in the store', async () => {
    const { http, fetchMock } = setup({ accessToken: 'A', refreshToken: 'R' });

    const first = await http.renew('A');
    // The second window still names the token it was opened with.
    const second = await http.renew('A');

    expect(first).toEqual({ accessToken: 'new', refreshToken: 'R2' });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('has nothing to renew with when the store is empty', async () => {
    const { http, fetchMock } = setup(null);

    await expect(http.renew('A')).resolves.toBeNull();
    await expect(http.renew()).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Http remembers what the server said and asks «same as before?»', () => {
  const tag = (value: string) => ({ 'content-type': 'application/json', etag: value });
  const reply = (status: number, body: unknown, etag?: string) =>
    new Response(status === 304 ? null : JSON.stringify(body), {
      status,
      headers: etag === undefined ? {} : tag(etag),
    });
  const make = (fetchMock: unknown) =>
    new Http({
      baseUrl: 'http://api/api/v1',
      tokens: memoryTokens({ accessToken: 'A', refreshToken: 'R' }),
      locale: () => 'ru',
      fetch: fetchMock as typeof fetch,
    });
  const sentHeaders = (mock: ReturnType<typeof vi.fn>, call: number) =>
    (mock.mock.calls[call] as unknown as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;

  it('sends the tag back, and gives the same data from memory when the answer is 304', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { ok: true, data: [{ id: 'o1' }] }, 'W/"v1"'))
      .mockResolvedValueOnce(reply(304, null, 'W/"v1"'))
      .mockResolvedValueOnce(reply(304, null, 'W/"v1"'));
    const http = make(mock);

    const first = await http.request<{ id: string }[]>('GET', '/orders');
    const again = await http.request<{ id: string }[]>('GET', '/orders');

    expect(first).toEqual([{ id: 'o1' }]);
    expect(again).toEqual([{ id: 'o1' }]);
    expect(sentHeaders(mock, 0)['if-none-match']).toBeUndefined();
    expect(sentHeaders(mock, 1)['if-none-match']).toBe('W/"v1"');
    // Each caller gets a copy of its own: changing one cannot change what is remembered.
    first.push({ id: 'x' });
    expect(await http.request('GET', '/orders')).toEqual([{ id: 'o1' }]);
  });

  it('takes the new body, and the new tag, when the list changed', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { ok: true, data: [1] }, 'W/"v1"'))
      .mockResolvedValueOnce(reply(200, { ok: true, data: [1, 2] }, 'W/"v2"'))
      .mockResolvedValueOnce(reply(304, null, 'W/"v2"'));
    const http = make(mock);
    await http.request('GET', '/orders');
    expect(await http.request('GET', '/orders')).toEqual([1, 2]);
    expect(await http.request('GET', '/orders')).toEqual([1, 2]);
    expect(sentHeaders(mock, 2)['if-none-match']).toBe('W/"v2"');
  });

  it('keeps one answer per page, per language, and never for a write', async () => {
    const mock = vi.fn(async () => reply(200, { ok: true, data: 1 }, 'W/"v1"'));
    let language = 'ru';
    const http = new Http({
      baseUrl: 'http://api/api/v1',
      tokens: memoryTokens(null),
      locale: () => language,
      fetch: mock as unknown as typeof fetch,
    });
    await http.request('GET', '/stores', { query: { page: 1 } });
    await http.request('GET', '/stores', { query: { page: 2 } });
    language = 'uz';
    await http.request('GET', '/stores', { query: { page: 1 } });
    await http.request('POST', '/orders', { body: {} });
    await http.request('POST', '/orders', { body: {} });
    for (let i = 0; i < 5; i += 1) expect(sentHeaders(mock, i)['if-none-match']).toBeUndefined();
  });

  it('asks again without a tag when a 304 comes for one it no longer holds', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(reply(304, null))
      .mockResolvedValueOnce(reply(200, { ok: true, data: 'fresh' }, 'W/"v9"'));
    const http = make(mock);
    expect(await http.request('GET', '/orders')).toBe('fresh');
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('forgets everything on sign-out', async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { ok: true, data: 1 }, 'W/"v1"'))
      .mockResolvedValueOnce(reply(200, { ok: true, data: 1 }, 'W/"v1"'));
    const http = make(mock);
    await http.request('GET', '/orders');
    http.clearCache();
    await http.request('GET', '/orders');
    expect(sentHeaders(mock, 1)['if-none-match']).toBeUndefined();
  });

  it('keeps its memory within bounds: the oldest answers go first', async () => {
    const mock = vi.fn(async () => reply(200, { ok: true, data: 1 }, 'W/"v1"'));
    const http = make(mock);
    // 60 different pages: more than it keeps.
    for (let page = 0; page < 60; page += 1)
      await http.request('GET', '/stores', { query: { page } });
    await http.request('GET', '/stores', { query: { page: 59 } });
    await http.request('GET', '/stores', { query: { page: 0 } });
    // The latest page is remembered; the first has been let go.
    expect(sentHeaders(mock, 60)['if-none-match']).toBe('W/"v1"');
    expect(sentHeaders(mock, 61)['if-none-match']).toBeUndefined();
  });
});

describe('Http on a weak connection', () => {
  const ok = (data: unknown) => json(200, { ok: true, data });
  const make = (fetchMock: unknown) =>
    new Http({
      baseUrl: 'http://api/api/v1',
      tokens: memoryTokens(null),
      retryDelayMs: 0,
      fetch: fetchMock as typeof fetch,
    });
  /** A connection that never answers, but lets go when asked to. */
  const silent = (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      // As fetch does: an already-cancelled signal fails at once.
      if (init?.signal?.aborted) return reject(new Error('aborted'));
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  it('asks a read once more when the connection dropped, and gives the answer', async () => {
    const mock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(ok([1, 2]));
    expect(await make(mock).request('GET', '/stores')).toEqual([1, 2]);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('asks again after a 503 from the gateway, but not after an error that is the API’s own', async () => {
    const down = vi
      .fn()
      .mockResolvedValueOnce(new Response('upstream down', { status: 503 }))
      .mockResolvedValueOnce(ok('back'));
    expect(await make(down).request('GET', '/stores')).toBe('back');

    const refused = vi.fn(async () =>
      json(404, { ok: false, error: { code: 'NOT_FOUND', message: 'no such store' } }),
    );
    await expect(make(refused).request('GET', '/stores/x')).rejects.toMatchObject({ status: 404 });
    expect(refused).toHaveBeenCalledTimes(1);
  });

  it('gives up with a NETWORK error after the second failure', async () => {
    const mock = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(make(mock).request('GET', '/stores')).rejects.toMatchObject({ code: 'NETWORK' });
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('never sends a write twice by itself: the first may have reached the server', async () => {
    const mock = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expect(make(mock).request('POST', '/orders', { body: {} })).rejects.toMatchObject({
      code: 'NETWORK',
    });
    expect(mock).toHaveBeenCalledTimes(1);

    const gateway = vi.fn(async () => new Response('bad gateway', { status: 502 }));
    await expect(make(gateway).request('POST', '/orders', { body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(gateway).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a connection that says nothing', async () => {
    const mock = vi.fn(silent);
    const started = Date.now();
    const failure = await make(mock)
      .request('GET', '/stores', { timeoutMs: 30 })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe('NETWORK');
    expect(String((failure as ApiError).cause)).toMatch(/no answer within 30 ms/);
    // Two tries of 30 ms, not the minutes a stalled phone would wait.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it('does not retry what the caller itself cancelled', async () => {
    const mock = vi.fn(silent);
    const controller = new AbortController();
    const pending = make(mock).request('GET', '/stores', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'NETWORK' });
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
