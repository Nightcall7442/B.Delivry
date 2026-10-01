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
