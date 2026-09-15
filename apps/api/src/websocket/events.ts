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

export function parseCommand(raw: string): IncomingCommand | null {
  try {
    const parsed = JSON.parse(raw) as { action?: unknown };
    if (typeof parsed.action !== 'string') return null;

    switch (parsed.action) {
      case WS_COMMAND.JOIN:
      case WS_COMMAND.LEAVE:
        return typeof (parsed as JoinCommand).room === 'string'
          ? (parsed as JoinCommand | LeaveCommand)
          : null;
      case WS_COMMAND.PING:
        return { action: 'ping' };
      case WS_COMMAND.LOCATION: {
        const command = parsed as LocationCommand;
        return typeof command.lat === 'number' && typeof command.lng === 'number' ? command : null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
