/**
 * WebSocket barrel.
 */
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { authenticateSocket } from './auth.js';
import { WebsocketGateway } from './gateway.js';
import { handleMessage } from './handlers/index.js';

export * from './events.js';
export * from './gateway.js';
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
    // Ownership of an order cannot be read from a token, so the gateway asks
    // the orders service, inside the socket's own request context.
    ownsOrder: async (orderId, user) => {
      try {
        const order = await container.services.orders.get(orderId);
        return (
          order.customerId === user.customerId ||
          (order.courierId !== null && order.courierId === user.courierId)
        );
      } catch {
        return false;
      }
    },
  });

  await app.register(websocket, {
    options: { maxPayload: 64 * 1024 },
  });

  app.get('/ws', { websocket: true }, async (socket, request) => {
    const user = await authenticateSocket(request.url, container.services.tokens);

    if (user === null) {
      socket.close(4401, 'Unauthorized');
      return;
    }

    const connection = gateway.add(socket, user);
    container.logger.debug({ userId: user.id, connections: gateway.size }, 'websocket connected');

    socket.on('message', (data: Buffer) => {
      void handleMessage(connection, data.toString(), {
        gateway,
        tracking: container.services.tracking,
        logger: container.logger,
      }).catch((error: unknown) => {
        container.logger.warn({ err: error }, 'websocket message failed');
      });
    });

    socket.on('close', () => gateway.remove(connection.id));
    socket.on('error', () => gateway.remove(connection.id));
  });

  await gateway.start();
  app.addHook('onClose', async () => gateway.stop());
}
