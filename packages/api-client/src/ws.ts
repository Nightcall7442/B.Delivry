/**
 * WebSocket client wrapper (reconnect, rooms, typed events).
 *
 * Protocol (see apps/api/src/websocket): `GET /ws?token=<access token>`,
 * commands `{ action: 'join' | 'leave', room }`, `{ action: 'ping' }`;
 * server messages `{ event, data }`. Rooms rejoin themselves after a
 * reconnect, so a screen subscribes once and forgets about the socket.
 */
import type { ServerEvents, WsEventName } from '@bazar/types';

import type { TokenStore, Tokens } from './types.js';

type Listener<K extends WsEventName> = (data: ServerEvents[K]) => void;

/** How often a live socket is asked to prove it (the server answers `ping` with `pong`). */
const PING_MS = 20_000;
/**
 * Pings in a row that got no answer (no pong, no event) before the socket is called half-open: the
 * phone still says OPEN (the server was redeployed, the network changed) but nobody is there, and
 * every push is lost. Counted in pings, not seconds: a hidden browser tab runs its timers once a
 * minute, and wall-clock silence would make it reconnect on every tick.
 */
const MAX_UNANSWERED = 2;
/** Reconnect delay cap: a courier waiting for an offer cannot afford half a minute of deafness. */
const MAX_BACKOFF_MS = 10_000;
/** Extra wait before renewing after a refused token, so windows sharing one do not renew in lockstep. */
const RENEW_JITTER_MS = 3_000;

export interface RealtimeOptions {
  /** e.g. ws://localhost:4000/ws */
  url: string;
  tokens: TokenStore;
  /** Renews an expired access token; the handshake is the one 401 HTTP never sees. */
  renew?: (stale?: string) => Promise<Tokens | null>;
  WebSocket?: typeof WebSocket;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private readonly rooms = new Set<string>();
  private readonly listeners = new Map<WsEventName, Set<Listener<WsEventName>>>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private unanswered = 0;
  private closed = true;
  /** The access token the current socket was opened with: what a renewal has to replace. */
  private openedWith: string | undefined;

  constructor(private readonly options: RealtimeOptions) {}

  /** Idempotent: connects once; later calls only wake a closed client. */
  async connect(): Promise<void> {
    this.closed = false;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    const tokens = await this.options.tokens.get();
    if (!tokens) return;

    const Ctor = this.options.WebSocket ?? WebSocket;
    const socket = new Ctor(`${this.options.url}?token=${encodeURIComponent(tokens.accessToken)}`);
    this.socket = socket;
    this.openedWith = tokens.accessToken;

    socket.onopen = () => {
      this.attempt = 0;
      this.unanswered = 0;
      this.watch(socket);
      for (const room of this.rooms) socket.send(JSON.stringify({ action: 'join', room }));
    };
    socket.onmessage = (message: MessageEvent) => {
      this.unanswered = 0;
      let parsed: { event?: WsEventName; data?: unknown } | null = null;
      try {
        parsed = JSON.parse(String(message.data)) as { event?: WsEventName; data?: unknown };
      } catch {
        return;
      }
      if (!parsed?.event) return;
      for (const listener of this.listeners.get(parsed.event) ?? []) {
        listener(parsed.data as ServerEvents[WsEventName]);
      }
    };
    // Typed structurally: `CloseEvent` is a DOM name and the API server compiles this file too.
    socket.onclose = (event: { code: number }) => {
      // A socket already given up on (see `watch`) may still report its close much later.
      if (this.socket !== socket) return;
      this.socket = null;
      this.unwatch();
      if (!this.closed) this.reconnect(event.code);
    };
    socket.onerror = () => socket.close();
  }

  /** 1s, 2s, 4s … capped at 10s. A dead network costs nothing; a flapping one is not hammered. */
  private reconnect(code: number): void {
    // Two windows of one browser hold sockets on the same token and are told at the same moment;
    // a spread keeps their renewals apart (see the store check in `renew`).
    const jitter = code === 4401 ? Math.floor(Math.random() * RENEW_JITTER_MS) : 0;
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt++) + jitter;
    this.timer = setTimeout(() => {
      // 4401: the server refused the token. Renew it first, or every retry
      // would knock with the same expired key until the app makes an HTTP call.
      const ready =
        code === 4401 && this.options.renew
          ? this.options.renew(this.openedWith)
          : Promise.resolve(null);
      void ready.then(() => this.connect());
    }, delay);
  }

  /** Pings a live socket; one that stays silent is dropped now, not when the OS finally notices. */
  private watch(socket: WebSocket): void {
    this.unwatch();
    this.watchdog = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (this.unanswered >= MAX_UNANSWERED) {
        this.socket = null;
        this.unwatch();
        try {
          socket.close();
        } catch {
          // Already gone.
        }
        if (!this.closed) this.reconnect(0);
        return;
      }
      this.unanswered += 1;
      socket.send(JSON.stringify({ action: 'ping' }));
    }, PING_MS);
  }

  private unwatch(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.unwatch();
    this.socket?.close();
    this.socket = null;
  }

  join(room: string): void {
    this.rooms.add(room);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'join', room }));
    }
  }

  leave(room: string): void {
    this.rooms.delete(room);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'leave', room }));
    }
  }

  /** Courier apps stream their position over the socket; dropped while offline. */
  location(fix: {
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
    accuracyMeters?: number;
    recordedAt?: string;
    orderId?: string;
  }): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'location', ...fix }));
    }
  }

  on<K extends WsEventName>(event: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as Listener<WsEventName>);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener as Listener<WsEventName>);
    };
  }
}

/** Room names, mirrored from the server so nobody types `order:` by hand. */
export const room = {
  order: (orderId: string) => `order:${orderId}`,
  customer: (customerId: string) => `customer:${customerId}`,
  courier: (courierId: string) => `courier:${courierId}`,
  store: (storeId: string) => `store:${storeId}`,
};
