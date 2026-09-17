/**
 * HTTP client core: base URL, auth token provider, refresh flow, request-id, locale header.
 *
 * Every endpoint module is a thin function over `Http.request`; this file is
 * the only place that knows about headers, the envelope and token refresh.
 */
import type { ApiResponse, AuthResultDto } from '@bazar/types';

import { ApiError } from './errors.js';
import type { ApiClientOptions, Paginated, Query, RequestOptions, Tokens } from './types.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class Http {
  private refreshing: Promise<Tokens | null> | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, '');
  }

  async request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    const envelope = await this.send<T>(method, path, options);
    return envelope.data;
  }

  /** List endpoints answer `{ data: T[], meta: { pagination } }`. */
  async paginated<T>(path: string, query?: Query): Promise<Paginated<T>> {
    const envelope = await this.send<T[]>('GET', path, query ? { query } : {});
    return {
      items: envelope.data,
      pagination: envelope.meta?.pagination ?? {
        page: 1,
        pageSize: envelope.data.length,
        total: envelope.data.length,
        totalPages: 1,
        hasNext: false,
      },
    };
  }

  private async send<T>(
    method: Method,
    path: string,
    options: RequestOptions,
    retried = false,
  ): Promise<Extract<ApiResponse<T>, { ok: true }>> {
    const tokens = options.auth === 'none' ? null : await this.options.tokens.get();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.raw !== undefined)
      headers['content-type'] = options.contentType ?? 'application/octet-stream';
    else if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (tokens) headers['authorization'] = `Bearer ${tokens.accessToken}`;
    if (this.options.locale) headers['x-locale'] = this.options.locale();
    if (this.options.tenant) headers['x-tenant'] = this.options.tenant;
    headers['x-request-id'] = requestId();

    const fetchImpl = this.options.fetch ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(this.baseUrl + path + toQueryString(options.query), {
        method,
        headers,
        ...(options.raw !== undefined
          ? { body: options.raw as NonNullable<RequestInit['body']> }
          : options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (cause) {
      throw ApiError.network(cause);
    }

    let parsed: ApiResponse<T> | null = null;
    try {
      parsed = (await response.json()) as ApiResponse<T>;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || !('ok' in parsed))
      throw ApiError.malformed(response.status);
    if (parsed.ok) return parsed;

    // One refresh per expired access token, shared by every request that hit the wall at once.
    if (response.status === 401 && tokens && !retried && options.auth !== 'none') {
      const renewed = await this.refresh(tokens);
      if (renewed) return this.send<T>(method, path, options, true);
    }
    throw new ApiError(response.status, parsed.error);
  }

  /** Renews the stored pair now — for callers that hit a 401 outside HTTP (the socket). */
  async renew(): Promise<Tokens | null> {
    const current = await this.options.tokens.get();
    return current ? this.refresh(current) : null;
  }

  private refresh(expired: Tokens): Promise<Tokens | null> {
    this.refreshing ??= (async () => {
      try {
        const current = await this.options.tokens.get();
        // Someone else already refreshed while we waited.
        if (current && current.accessToken !== expired.accessToken) return current;
        const result = await this.request<AuthResultDto>('POST', '/auth/refresh', {
          body: { refreshToken: expired.refreshToken },
          auth: 'none',
        });
        const next = { accessToken: result.accessToken, refreshToken: result.refreshToken };
        await this.options.tokens.set(next);
        return next;
      } catch (error) {
        // Only a refused refresh token ends the session. A dropped connection
        // or a server mid-restart is not a reason to throw the user out.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          await this.options.tokens.set(null);
          this.options.onSignedOut?.();
        }
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}

function toQueryString(query: Query | undefined): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) for (const item of value) params.append(key, String(item));
    else params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Good enough to correlate a client log line with a server one; not a UUID contract. */
const requestId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
