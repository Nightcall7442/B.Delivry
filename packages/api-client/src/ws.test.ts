/**
 * A push that reaches a socket nobody is listening on is lost for good — the courier is never told of
 * the order. After a redeploy the phone can keep calling a dead socket OPEN, so the client asks it to
 * prove it is alive, and a silent one is dropped and replaced without waiting for the OS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Tokens } from './types.js';
import { RealtimeClient } from './ws.js';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  hear(event: string, data: unknown = {}): void {
    this.onmessage?.({ data: JSON.stringify({ event, data }) });
  }

  drop(code = 1006): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const client = () =>
  new RealtimeClient({
    url: 'wss://api/ws',
    tokens: {
      get: () => ({ accessToken: 'A', refreshToken: 'R' }),
      set: () => {},
    },
    WebSocket: FakeSocket as unknown as typeof WebSocket,
  });

/** Lets the token lookup inside connect() settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);
const pings = (socket: FakeSocket) =>
  socket.sent.filter((frame) => frame.includes('"ping"')).length;

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  // The client compares readyState with the global constant.
  vi.stubGlobal('WebSocket', FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('RealtimeClient watchdog', () => {
  it('pings a live socket and keeps it while the server answers', async () => {
    const realtime = client();
    void realtime.connect();
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();

    await vi.advanceTimersByTimeAsync(20_000);
    expect(pings(socket)).toBe(1);
    socket.hear('pong');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(pings(socket)).toBe(2);
    socket.hear('pong');
    await vi.advanceTimersByTimeAsync(20_000);

    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
    realtime.close();
  });

  it('drops a socket that stays silent and reconnects at once, with its rooms', async () => {
    const realtime = client();
    realtime.join('courier:c1');
    void realtime.connect();
    await settle();
    const dead = FakeSocket.instances[0]!;
    dead.open();

    // No pong, no event: past the silence limit it is given up on.
    await vi.advanceTimersByTimeAsync(80_000);
    expect(dead.closed).toBe(true);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);

    const fresh = FakeSocket.instances[1]!;
    fresh.open();
    expect(fresh.sent).toContain(JSON.stringify({ action: 'join', room: 'courier:c1' }));
    realtime.close();
  });

  it('gives a quiet socket two unanswered pings before it drops it, and any event counts as an answer', async () => {
    const realtime = client();
    void realtime.connect();
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();

    // Two pings out (20 s, 40 s), nothing back: still there at 50 s.
    await vi.advanceTimersByTimeAsync(50_000);
    expect(socket.closed).toBe(false);

    // An event from the server proves the line: the count starts over (pings at 60 s and 80 s).
    socket.hear('delivery.offer');
    await vi.advanceTimersByTimeAsync(40_000);
    expect(socket.closed).toBe(false);

    // The next check finds two pings unanswered: gone.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(socket.closed).toBe(true);
    realtime.close();
  });

  it('ignores the late close report of a socket it already gave up on', async () => {
    const realtime = client();
    void realtime.connect();
    await settle();
    const dead = FakeSocket.instances[0]!;
    dead.open();
    await vi.advanceTimersByTimeAsync(80_000);
    const before = FakeSocket.instances.length;

    dead.drop();
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeSocket.instances).toHaveLength(before);
    realtime.close();
  });

  it('never waits longer than ten seconds to reconnect', async () => {
    const realtime = client();
    void realtime.connect();
    await settle();
    // Seven failed attempts in a row would be 1+2+4+8+16+32+64 s at the old cap of 30 s.
    for (let attempt = 0; attempt < 7; attempt += 1) {
      const socket = FakeSocket.instances.at(-1)!;
      socket.drop();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    expect(FakeSocket.instances.length).toBe(8);
    realtime.close();
  });

  it('stops pinging once closed', async () => {
    const realtime = client();
    void realtime.connect();
    await settle();
    const socket = FakeSocket.instances[0]!;
    socket.open();
    realtime.close();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(pings(socket)).toBe(0);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});

/**
 * The server closes with 4401 when it refuses the token. Two windows of one browser hold sockets on
 * the same token and are told in the same moment, so the renewal waits a second plus a random spread
 * (under three seconds), and then names the token this socket was opened with: the store may hold a
 * newer one by then, and `renew` hands that over instead of spending the refresh token twice.
 */
describe('RealtimeClient after the server refuses its token (4401)', () => {
  /** The pair the token store holds; a test moves it on the way another window would. */
  const store = { access: 'A' };
  const renewals: (string | undefined)[] = [];

  const withRenew = (renew: (stale?: string) => Promise<Tokens | null> = async () => null) =>
    new RealtimeClient({
      url: 'wss://api/ws',
      tokens: {
        get: () => ({ accessToken: store.access, refreshToken: 'R' }),
        set: () => {},
      },
      renew: (stale) => {
        renewals.push(stale);
        return renew(stale);
      },
      WebSocket: FakeSocket as unknown as typeof WebSocket,
    });

  const opened = async (realtime: RealtimeClient) => {
    void realtime.connect();
    await settle();
    const socket = FakeSocket.instances.at(-1)!;
    socket.open();
    return socket;
  };

  beforeEach(() => {
    store.access = 'A';
    renewals.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits a second plus a random spread of under three seconds, then renews', async () => {
    // Math.random at 0 / 0.5 / just under 1: a spread of 0 / 1500 / 2999 ms on top of the second.
    for (const [random, wait] of [
      [0, 1_000],
      [0.5, 2_500],
      [0.9999, 3_999],
    ] as const) {
      renewals.length = 0;
      FakeSocket.instances = [];
      vi.spyOn(Math, 'random').mockReturnValue(random);
      const realtime = withRenew();
      const socket = await opened(realtime);

      socket.drop(4401);
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(renewals, `${wait - 1} ms`).toEqual([]);

      await vi.advanceTimersByTimeAsync(1);
      expect(renewals, `${wait} ms`).toEqual(['A']);
      realtime.close();
      vi.restoreAllMocks();
    }
  });

  it('names the token the socket was opened with, not the one the store holds by now', async () => {
    const realtime = withRenew();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const socket = await opened(realtime);

    store.access = 'B'; // another window renewed while this socket was open
    socket.drop(4401);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(renewals).toEqual(['A']);
    realtime.close();
  });

  it('reconnects only once the renewal has settled, and then with the token the store holds', async () => {
    let settleRenewal: () => void = () => {};
    const realtime = withRenew(
      () =>
        new Promise<Tokens | null>((resolve) => {
          settleRenewal = () => resolve({ accessToken: 'B', refreshToken: 'R2' });
        }),
    );
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const socket = await opened(realtime);

    store.access = 'B';
    socket.drop(4401);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(renewals).toEqual(['A']);
    expect(FakeSocket.instances).toHaveLength(1);

    settleRenewal();
    await settle();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[1]!.url).toBe('wss://api/ws?token=B');
    realtime.close();
  });

  it('names the newer token the next time the server refuses it', async () => {
    const realtime = withRenew();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const first = await opened(realtime);
    first.drop(4401);
    store.access = 'B';
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeSocket.instances[1]!;
    expect(second.url).toBe('wss://api/ws?token=B');
    second.open();

    second.drop(4401);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(renewals).toEqual(['A', 'B']);
    realtime.close();
  });

  it('adds no spread and asks for no renewal after any other close', async () => {
    const random = vi.spyOn(Math, 'random');
    const realtime = withRenew();
    const socket = await opened(realtime);

    socket.drop(1006);
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(FakeSocket.instances).toHaveLength(2);
    expect(renewals).toEqual([]);
    expect(random).not.toHaveBeenCalled();
    realtime.close();
  });
});
