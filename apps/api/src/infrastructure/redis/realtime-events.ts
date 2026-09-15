/**
 * Realtime event channel names + publisher (bridges events/ → websocket/).
 */
import type { ServerEvents, WsEventName } from '@bazar/types';
import type { PubSub } from './pubsub.js';

/** One Redis channel for all realtime traffic; the room decides who gets it. */
export const REALTIME_CHANNEL = 'realtime';

export interface RealtimeMessage<K extends WsEventName = WsEventName> {
  /** Room name from websocket/rooms.ts, e.g. order:123. */
  room: string;
  event: K;
  data: ServerEvents[K];
  at: string;
}

/**
 * The seam between domain events and sockets. Event handlers call `emit` and
 * never touch a socket; the gateway on every instance receives the message and
 * delivers it to whichever clients are in that room locally.
 */
export class RealtimePublisher {
  constructor(private readonly pubsub: PubSub) {}

  async emit<K extends WsEventName>(room: string, event: K, data: ServerEvents[K]): Promise<void> {
    const message: RealtimeMessage<K> = { room, event, data, at: new Date().toISOString() };
    await this.pubsub.publish(REALTIME_CHANNEL, message);
  }

  /** Same payload to several rooms (customer, courier and operator screens). */
  async emitToRooms<K extends WsEventName>(
    rooms: readonly string[],
    event: K,
    data: ServerEvents[K],
  ): Promise<void> {
    await Promise.all(rooms.map((room) => this.emit(room, event, data)));
  }
}

export const isRealtimeMessage = (value: unknown): value is RealtimeMessage =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as RealtimeMessage).room === 'string' &&
  typeof (value as RealtimeMessage).event === 'string';
