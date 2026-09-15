/**
 * Attach/propagate X-Request-Id.
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export const REQUEST_ID_HEADER = 'x-request-id';

/** A client-supplied id is echoed back, but never trusted beyond this length. */
const MAX_LENGTH = 128;

/**
 * One id follows a request through every log line, the audit row and the
 * error response. When a courier reports "it failed at 14:32", this is what
 * turns that into a single trace.
 */
export function registerRequestId(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers[REQUEST_ID_HEADER];
    const supplied = Array.isArray(incoming) ? incoming[0] : incoming;
    const requestId =
      supplied !== undefined && supplied.length > 0 && supplied.length <= MAX_LENGTH
        ? supplied
        : randomUUID();

    request.requestId = requestId;
    void reply.header(REQUEST_ID_HEADER, requestId);
  });
}
