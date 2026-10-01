/**
 * The /ws route end to end, on a real server and a real client: the handshake verdict, the frames a
 * client sends before that verdict arrives (the api-client joins its rooms the moment the socket
 * opens), and the socket being closed with 4401 when its access token runs out (which is what makes
 * the api-client renew its token and reconnect).
 *
 * Only the container is fake: no database, no Redis.
 */
import { effectivePermissions } from '@bazar/auth';
import { ROLE } from '@bazar/constants';
import fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { UnauthorizedError } from '../../src/common/errors/index.js';
import { registerWebsocket } from '../../src/websocket/index.js';

const logger = { error() {}, warn() {}, info() {}, debug() {} };

const jwt = (exp: number) =>
  [
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from(JSON.stringify({ exp })).toString('base64url'),
    'signature',
  ].join('.');

const customer = {
  id: 'user-1',
  tenantId: 't1',
  roles: [ROLE.CUSTOMER],
  permissions: effectivePermissions([ROLE.CUSTOMER]),
  sessionId: 's1',
  locale: 'ru',
  customerId: 'cust-1',
};

let app: FastifyInstance | null = null;
const clients: WebSocket[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await app?.close();
  app = null;
});

async function serve(options: { verifyDelayMs?: number } = {}) {
  const verified: string[] = [];
  const container = {
    pubsub: { subscribe: async () => {}, publish: async () => {} },
    logger,
    prisma: {},
    services: {
      tokens: {
        async verifyAccessToken(token: string) {
          verified.push(token);
          if (options.verifyDelayMs) await new Promise((r) => setTimeout(r, options.verifyDelayMs));
          if (token === 'revoked') throw new UnauthorizedError('Session revoked');
          return customer;
        },
      },
      orders: {
        async get() {
          return {
            id: 'o1',
            customerId: 'cust-1',
            courierId: null,
            store: { vendorId: 'v1' },
          };
        },
      },
      tracking: {},
    },
  };
  app = fastify();
  await registerWebsocket(app, container as never);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as { port: number };
  return { url: `ws://127.0.0.1:${port}/ws`, verified };
}

// Node's own WebSocket client (the one the api-client runs on); `ws` is not a direct dependency.
const open = (url: string) => {
  const client = new WebSocket(url);
  clients.push(client);
  return client;
};

const closeCode = (client: WebSocket) =>
  new Promise<number>((resolve) =>
    client.addEventListener('close', (event) => resolve(event.code)),
  );

const opened = (client: WebSocket, then: () => void) =>
  client.addEventListener('open', then, { once: true });

const nextFrame = (client: WebSocket) =>
  new Promise<{ event: string; data: Record<string, unknown> }>((resolve) =>
    client.addEventListener('message', (message) => resolve(JSON.parse(String(message.data))), {
      once: true,
    }),
  );

describe('the websocket route', () => {
  it('closes with 4401 when the token does not verify', async () => {
    const { url } = await serve();
    expect(await closeCode(open(`${url}?token=revoked`))).toBe(4401);
    expect(await closeCode(open(url))).toBe(4401);
  });

  it('refuses a token that verifies but carries no expiry, rather than serving it for ever', async () => {
    const { url } = await serve();
    expect(await closeCode(open(`${url}?token=opaque-token`))).toBe(4401);
  });

  it('does not lose the frames a client sends while its token is still being checked', async () => {
    const { url } = await serve({ verifyDelayMs: 150 });
    const exp = Math.floor(Date.now() / 1000) + 900;
    const client = open(`${url}?token=${jwt(exp)}`);
    // The api-client does exactly this in `onopen`.
    opened(client, () => client.send(JSON.stringify({ action: 'join', room: 'order:o1' })));

    const frame = await nextFrame(client);

    expect(frame.event).toBe('joined');
    expect(frame.data).toEqual({ room: 'order:o1' });
  });

  it('closes the socket with 4401 when the access token expires', async () => {
    const { url } = await serve();
    const exp = Math.floor(Date.now() / 1000) + 1;
    const client = open(`${url}?token=${jwt(exp)}`);
    const reply = nextFrame(client);
    opened(client, () => client.send(JSON.stringify({ action: 'ping' })));
    expect((await reply).event).toBe('pong');

    expect(await closeCode(client)).toBe(4401);
  }, 10_000);

  it('answers a room it may not join with an error frame, and stays connected', async () => {
    const { url } = await serve();
    const exp = Math.floor(Date.now() / 1000) + 900;
    const client = open(`${url}?token=${jwt(exp)}`);
    opened(client, () => client.send(JSON.stringify({ action: 'join', room: 'store:s1' })));

    const frame = await nextFrame(client);

    expect(frame.event).toBe('error');
    expect(client.readyState).toBe(WebSocket.OPEN);
  });
});
