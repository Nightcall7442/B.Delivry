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

/**
 * A request that hears nothing is given up on, not waited for: a stalled mobile connection leaves
 * fetch pending for minutes (on a phone, sometimes for ever) and the screen shows a spinner the
 * whole time. Reads are given a short time and one more try; a photo upload a long one.
 */
const READ_TIMEOUT_MS = 12_000;
const WRITE_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 600;
/** The gateway or the server restarting: worth asking again, unlike a 4xx. */
const TRANSIENT_STATUS = new Set([502, 503, 504]);

/**
 * What «same as before» is answered from: the last body the server sent for a GET and the tag it
 * sent with it. A poll that finds nothing new costs a few hundred bytes instead of the whole list.
 * The tag is a hash of the body, so the server answers 304 only when this very request would give
 * these very bytes again — the copy can never be stale, only unused.
 *
 * Bounded by what a weak phone can spare: a few dozen answers, and a few MB of text in all.
 */
const CACHE_MAX_ENTRIES = 48;
const CACHE_MAX_CHARS = 1_500_000;
/** One answer larger than this is not worth the memory it would take from the others. */
const CACHE_MAX_ENTRY_CHARS = 400_000;

interface Remembered {
  etag: string;
  text: string;
}

/** A success envelope, with the HTTP status it came in. */
type Sent<T> = Extract<ApiResponse<T>, { ok: true }> & { status: number };

export class Http {
  private refreshing: Promise<Tokens | null> | null = null;
  /** Oldest first: a Map keeps insertion order, and a hit moves its entry to the end. */
  private readonly remembered = new Map<string, Remembered>();
  private rememberedChars = 0;

  constructor(private readonly options: ApiClientOptions) {}

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, '');
  }

  /** Forgets every remembered answer: on sign-out, so the next person's session starts clean. */
  clearCache(): void {
    this.remembered.clear();
    this.rememberedChars = 0;
  }

  private recall(key: string): Remembered | undefined {
    const hit = this.remembered.get(key);
    if (hit === undefined) return undefined;
    this.remembered.delete(key);
    this.remembered.set(key, hit);
    return hit;
  }

  private remember(key: string, entry: Remembered): void {
    if (entry.text.length > CACHE_MAX_ENTRY_CHARS) return;
    const old = this.remembered.get(key);
    if (old !== undefined) this.rememberedChars -= old.text.length;
    this.remembered.delete(key);
    this.remembered.set(key, entry);
    this.rememberedChars += entry.text.length;
    for (const oldest of this.remembered.keys()) {
      if (this.remembered.size <= CACHE_MAX_ENTRIES && this.rememberedChars <= CACHE_MAX_CHARS)
        break;
      const dropped = this.remembered.get(oldest);
      this.remembered.delete(oldest);
      if (dropped !== undefined) this.rememberedChars -= dropped.text.length;
    }
  }

  async request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    const envelope = await this.send<T>(method, path, options);
    return envelope.data;
  }

  /** List endpoints answer `{ data: T[], meta: { pagination } }`. */
  async paginated<T>(path: string, query?: Query): Promise<Paginated<T>> {
    const envelope = await this.send<T[]>('GET', path, query ? { query } : {});
    // A list that answered with no body is a broken reply, not an empty list.
    if (!Array.isArray(envelope.data)) throw ApiError.malformed(envelope.status);
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
    /** Set when a 304 came back for a tag we no longer hold: ask again without one. */
    plain = false,
  ): Promise<Sent<T>> {
    const tokens = options.auth === 'none' ? null : await this.options.tokens.get();
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.raw !== undefined)
      headers['content-type'] = options.contentType ?? 'application/octet-stream';
    else if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (tokens) headers['authorization'] = `Bearer ${tokens.accessToken}`;
    if (this.options.locale) headers['x-locale'] = this.options.locale();
    if (this.options.tenant) headers['x-tenant'] = this.options.tenant;
    headers['x-request-id'] = requestId();

    const url = this.baseUrl + path + toQueryString(options.query);
    // Reads only: a write is never answered from memory. Keyed by what changes the answer.
    const key =
      method === 'GET' && options.raw === undefined
        ? `${url}|${headers['x-locale'] ?? ''}|${headers['x-tenant'] ?? ''}`
        : null;
    const known = key !== null && !plain ? this.recall(key) : undefined;
    if (known !== undefined) headers['if-none-match'] = known.etag;

    const { response, body: received } = await this.exchange(method, url, headers, options);
    let body = received;
    // «Same as before»: the body is the one we kept, and the status is the 200 it was.
    if (response.status === 304) {
      if (known === undefined) return this.send<T>(method, path, options, retried, true);
      body = known.text;
    }
    // 204, or any 2xx with nothing in it: the write went through and there is nothing to say
    // (the API's noContent()). A body that is there but is not ours is still malformed.
    if (response.ok && body !== null && body.trim() === '')
      return { ok: true, data: undefined as T, status: response.status };
    const status = response.status === 304 ? 200 : response.status;

    let parsed: ApiResponse<T> | null = null;
    try {
      parsed = JSON.parse(body ?? '') as ApiResponse<T>;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== 'object' || !('ok' in parsed))
      throw ApiError.malformed(status);
    if (parsed.ok) {
      const etag = response.status === 200 ? response.headers.get('etag') : null;
      if (key !== null && etag !== null && body !== null) this.remember(key, { etag, text: body });
      return { ...parsed, status };
    }

    // One refresh per expired access token, shared by every request that hit the wall at once.
    if (response.status === 401 && tokens && !retried && options.auth !== 'none') {
      const renewed = await this.refresh(tokens);
      if (renewed) return this.send<T>(method, path, options, true);
    }
    throw new ApiError(response.status, parsed.error);
  }

  /**
   * One request over the wire, with its time limit — and, for a read, one more try when the
   * connection dropped, timed out or the gateway answered 502/503/504. A write is sent once, never
   * again by us: the first may have reached the server, and an order must not be placed twice.
   */
  private async exchange(
    method: Method,
    url: string,
    headers: Record<string, string>,
    options: RequestOptions,
  ): Promise<{ response: Response; body: string | null }> {
    const fetchImpl = this.options.fetch ?? fetch;
    const attempts = method === 'GET' ? 2 : 1;
    const limit =
      options.timeoutMs ??
      (options.raw !== undefined
        ? UPLOAD_TIMEOUT_MS
        : method === 'GET'
          ? READ_TIMEOUT_MS
          : WRITE_TIMEOUT_MS);
    const pause = this.options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

    for (let attempt = 1; ; attempt += 1) {
      const controller = new AbortController();
      const giveUp = () => controller.abort();
      // The caller's own signal (leaving the screen) still cancels, and is never retried.
      if (options.signal?.aborted) controller.abort();
      options.signal?.addEventListener('abort', giveUp);
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, limit);
      try {
        const response = await fetchImpl(url, {
          method,
          headers,
          ...(options.raw !== undefined
            ? { body: options.raw as NonNullable<RequestInit['body']> }
            : options.body === undefined
              ? {}
              : { body: JSON.stringify(options.body) }),
          signal: controller.signal,
        });
        let body: string | null;
        try {
          body = await response.text();
        } catch {
          body = null;
        }
        if (attempt < attempts && TRANSIENT_STATUS.has(response.status)) {
          await sleep(pause);
          continue;
        }
        return { response, body };
      } catch (cause) {
        if (attempt < attempts && options.signal?.aborted !== true) {
          await sleep(pause);
          continue;
        }
        throw ApiError.network(timedOut ? new Error(`no answer within ${limit} ms`) : cause);
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', giveUp);
      }
    }
  }

  /**
   * Renews the stored pair now — for callers that hit a 401 outside HTTP (the socket). `stale` is the
   * access token the caller was using: when the store already holds a newer one (another tab of the
   * same browser got there first) that pair is the answer, and the refresh token is not spent twice.
   */
  async renew(stale?: string): Promise<Tokens | null> {
    const current = await this.options.tokens.get();
    if (!current) return null;
    if (stale !== undefined && current.accessToken !== stale) return current;
    return this.refresh(current);
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
          this.clearCache();
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

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

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
