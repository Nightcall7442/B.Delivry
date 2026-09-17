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

export interface RealtimeOptions {
  /** e.g. ws://localhost:4000/ws */
  url: string;
  tokens: TokenStore;
  /** Renews an expired access token; the handshake is the one 401 HTTP never sees. */
  renew?: () => Promise<Tokens | null>;
  WebSocket?: typeof WebSocket;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private readonly rooms = new Set<string>();
  private readonly listeners = new Map<WsEventName, Set<Listener<WsEventName>>>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = true;

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

    socket.onopen = () => {
      this.attempt = 0;
      for (const room of this.rooms) socket.send(JSON.stringify({ action: 'join', room }));
    };
    socket.onmessage = (message: MessageEvent) => {
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
      this.socket = null;
      if (this.closed) return;
      // 1s, 2s, 4s … capped at 30s. A dead network costs nothing; a flapping one is not hammered.
      const delay = Math.min(30_000, 1000 * 2 ** this.attempt++);
      this.timer = setTimeout(() => {
        // 4401: the server refused the token. Renew it first, or every retry
        // would knock with the same expired key until the app makes an HTTP call.
        const ready =
          event.code === 4401 && this.options.renew ? this.options.renew() : Promise.resolve(null);
        void ready.then(() => this.connect());
      }, delay);
    };
    socket.onerror = () => socket.close();
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
