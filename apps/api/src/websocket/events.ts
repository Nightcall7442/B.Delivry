/**
 * Typed WS event names & payloads (client↔server). Shared subset lives in @bazar/types.
 */
export { WS_EVENT } from '@bazar/types';
export type { ServerEvents, WsEventName, WsMessage, WsClientCommand } from '@bazar/types';

/** Commands the client may send. Anything else is ignored. */
export const WS_COMMAND = {
  JOIN: 'join',
  LEAVE: 'leave',
  PING: 'ping',
  /** Courier apps stream position over the socket rather than by HTTP. */
  LOCATION: 'location',
} as const;

export type WsCommandName = (typeof WS_COMMAND)[keyof typeof WS_COMMAND];

export interface JoinCommand {
  action: 'join';
  room: string;
}

export interface LeaveCommand {
  action: 'leave';
  room: string;
}

export interface PingCommand {
  action: 'ping';
}

export interface LocationCommand {
  action: 'location';
  lat: number;
  lng: number;
  heading?: number;
  speedKmh?: number;
  accuracyMeters?: number;
  recordedAt?: string;
  orderId?: string;
}

export type IncomingCommand = JoinCommand | LeaveCommand | PingCommand | LocationCommand;

/** Longest room name a client may name; real ones are `kind:` plus a 36-char uuid. */
const MAX_ROOM_NAME = 80;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Built field by field from what the client sent, never handed on as parsed: a command is
 * untrusted input, and the location one ends up broadcast to other people's screens.
 */
export function parseCommand(raw: string): IncomingCommand | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.action !== 'string') {
      return null;
    }

    switch (parsed.action) {
      case WS_COMMAND.JOIN:
      case WS_COMMAND.LEAVE:
        return typeof parsed.room === 'string' && parsed.room.length <= MAX_ROOM_NAME
          ? { action: parsed.action, room: parsed.room }
          : null;
      case WS_COMMAND.PING:
        return { action: 'ping' };
      case WS_COMMAND.LOCATION: {
        if (!finite(parsed.lat) || !finite(parsed.lng)) return null;
        return {
          action: 'location',
          lat: parsed.lat,
          lng: parsed.lng,
          ...(finite(parsed.heading) ? { heading: parsed.heading } : {}),
          ...(finite(parsed.speedKmh) ? { speedKmh: parsed.speedKmh } : {}),
          ...(finite(parsed.accuracyMeters) ? { accuracyMeters: parsed.accuracyMeters } : {}),
          ...(typeof parsed.recordedAt === 'string' && parsed.recordedAt.length <= 40
            ? { recordedAt: parsed.recordedAt }
            : {}),
          ...(typeof parsed.orderId === 'string' && parsed.orderId.length <= 64
            ? { orderId: parsed.orderId }
            : {}),
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
