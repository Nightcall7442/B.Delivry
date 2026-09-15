/**
 * 404 handler.
 */
import type { ApiFailure } from '@bazar/types';
import type { FastifyInstance } from 'fastify';
import { ERROR_CODE } from '../common/errors/error-codes.js';

/**
 * Same envelope as every other failure, so clients have exactly one response
 * shape to parse. The path is echoed back because a 404 on an API is almost
 * always a typo or a version mismatch, and saying which path helps.
 */
export function registerNotFound(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const payload: ApiFailure = {
      ok: false,
      error: {
        code: ERROR_CODE.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.requestId,
      },
    };
    void reply.code(404).send(payload);
  });
}
