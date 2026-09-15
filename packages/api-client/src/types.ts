/**
 * Client config & response envelope types.
 */
import type { PaginationMeta } from '@bazar/types';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Where the pair lives is the app's business: localStorage, SecureStore, memory. */
export interface TokenStore {
  get(): Tokens | null | Promise<Tokens | null>;
  set(tokens: Tokens | null): void | Promise<void>;
}

export interface ApiClientOptions {
  /** e.g. http://localhost:4000/api/v1 */
  baseUrl: string;
  tokens: TokenStore;
  /** Sent as x-locale; read per request so a language switch needs no new client. */
  locale?: () => string;
  /** x-tenant slug for deployments that serve several tenants from one host. */
  tenant?: string;
  fetch?: typeof fetch;
  /** The refresh token was rejected: the app clears its session and shows login. */
  onSignedOut?: () => void;
}

export type QueryValue = string | number | boolean | undefined | null | readonly string[];
/** Any plain object of scalars; DTO query interfaces satisfy it structurally. */
export type Query = { readonly [key: string]: QueryValue };

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Raw bytes instead of JSON (image uploads); `contentType` names them. */
  raw?: Blob | ArrayBuffer | Uint8Array;
  contentType?: string;
  /** 'auto' attaches a token when there is one; 'none' never does (login, public lists). */
  auth?: 'auto' | 'none';
  signal?: AbortSignal;
}

export interface Paginated<T> {
  items: T[];
  pagination: PaginationMeta;
}
