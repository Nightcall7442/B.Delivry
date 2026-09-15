/**
 * HTTP server lifecycle (listen / close).
 */
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/index.js';

export interface RunningServer {
  app: FastifyInstance;
  address: string;
  close(): Promise<void>;
}

export async function startServer(app: FastifyInstance, config: AppConfig): Promise<RunningServer> {
  const address = await app.listen({ port: config.port, host: config.host });

  app.log.info({ address, prefix: config.prefix, env: config.env }, `${config.name} listening`);

  return {
    app,
    address,
    // Fastify drains in-flight requests before resolving, which is what makes
    // a rolling deploy not drop an order mid-checkout.
    close: () => app.close(),
  };
}
