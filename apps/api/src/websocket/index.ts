/**
 * WebSocket barrel.
 */
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { authenticateSocketSession } from './auth.js';
import { WebsocketGateway, WS_CLOSE, type Connection } from './gateway.js';
import { createRoomGuards } from './guards.js';
import { handleMessage } from './handlers/index.js';

export * from './events.js';
export * from './gateway.js';
export * from './rate-limit.js';
export * from './rooms.js';

/**
 * Mounts /ws. The handshake authenticates from a query-string token, because
 * browsers cannot set headers on a websocket upgrade; a socket that fails
 * authentication is closed immediately rather than left open and mute.
 */
export async function registerWebsocket(app: FastifyInstance, container: Container): Promise<void> {
  const gateway = new WebsocketGateway({
    pubsub: container.pubsub,
    logger: container.logger,
    // Ownership cannot be read from a token, so the gateway asks the orders service (inside the
    // socket's own request context) and the database, always for the user's own tenant.
    ...createRoomGuards({ prisma: container.prisma, orders: container.services.orders }),
  });

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  app.get('/ws', { websocket: true }, async (socket, request) => {
    let connection: Connection | null = null;
    const drop = () => {
      if (connection !== null) gateway.remove(connection.id);
    };
    // Listeners go on before the first await: a client that hangs up or errors while its token is
    // being checked must not be left registered, and its first frames (the api-client joins its
    // rooms the moment the socket opens) must wait for the verdict instead of vanishing.
    socket.on('close', drop);
    socket.on('error', drop);
    const session = authenticateSocketSession(request.url, container.services.tokens);

    socket.on('message', (data: Buffer) => {
      const raw = data.toString();
      void session
        .then(async (verified) => {
          if (connection === null || verified === null) return;
          await handleMessage(connection, raw, {
            gateway,
            tracking: container.services.tracking,
            logger: container.logger,
          });
        })
        .catch((error: unknown) => {
          container.logger.warn({ err: error }, 'websocket message failed');
        });
    });

    const verified = await session;
    if (verified === null) {
      socket.close(WS_CLOSE.UNAUTHORIZED, 'Unauthorized');
      return;
    }
    // Hung up while the token was being checked: nobody left to serve.
    if (socket.readyState !== 1) return;

    // The token is kept to re-verify the socket as it lives on (a logout, a block) and closes it
    // when the token runs out; the api-client then renews its token and reconnects by itself.
    connection = gateway.add(socket, verified.user, {
      expiresAt: verified.expiresAt,
      revalidate: () => container.services.tokens.verifyAccessToken(verified.token),
    });
    container.logger.debug(
      { userId: verified.user.id, connections: gateway.size },
      'websocket connected',
    );
  });

  await gateway.start();
  app.addHook('onClose', async () => gateway.stop());
}
