/**
 * PubSub interface for cross-instance realtime fan-out.
 */
import type { RedisConfig } from '../../config/index.js';
import type { Logger } from '../logger/index.js';
import { key, type RedisClient } from './redis.client.js';

export type PubSubHandler = (payload: unknown, channel: string) => void;

export interface PubSub {
  publish(channel: string, payload: unknown): Promise<void>;
  subscribe(channel: string, handler: PubSubHandler): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * A websocket client is connected to exactly one API instance, but the order it
 * is watching may be updated on another. Every instance publishes here and
 * every instance is subscribed, so the update reaches whichever socket needs it.
 */
export class RedisPubSub implements PubSub {
  private readonly handlers = new Map<string, Set<PubSubHandler>>();

  constructor(
    private readonly publisher: RedisClient,
    // A Redis connection in subscribe mode cannot run normal commands, so the
    // subscriber must be its own connection.
    private readonly subscriber: RedisClient,
    private readonly config: RedisConfig,
    private readonly logger: Logger,
  ) {
    this.subscriber.on('message', (channel, message) => this.dispatch(channel, message));
  }

  private channelKey(channel: string): string {
    return key(this.config, 'ps', channel);
  }

  private dispatch(channelKey: string, message: string): void {
    const handlers = this.handlers.get(channelKey);
    if (handlers === undefined) return;
    let payload: unknown;
    try {
      payload = JSON.parse(message);
    } catch (error) {
      this.logger.warn({ err: error, channelKey }, 'unparsable pubsub message');
      return;
    }
    for (const handler of handlers) {
      // One bad handler must not stop the others from getting the event.
      try {
        handler(payload, channelKey);
      } catch (error) {
        this.logger.error({ err: error, channelKey }, 'pubsub handler failed');
      }
    }
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(this.channelKey(channel), JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: PubSubHandler): Promise<void> {
    const channelKey = this.channelKey(channel);
    const existing = this.handlers.get(channelKey);
    if (existing !== undefined) {
      existing.add(handler);
      return;
    }
    this.handlers.set(channelKey, new Set([handler]));
    await this.subscriber.subscribe(channelKey);
  }

  async unsubscribe(channel: string): Promise<void> {
    const channelKey = this.channelKey(channel);
    this.handlers.delete(channelKey);
    await this.subscriber.unsubscribe(channelKey);
  }

  async close(): Promise<void> {
    this.handlers.clear();
    await this.subscriber.quit();
  }
}
