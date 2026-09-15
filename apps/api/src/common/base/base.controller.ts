/**
 * Abstract controller helpers: parse/validate input, map results to HTTP responses.
 */
import type { ApiSuccess, PaginationMeta } from '@bazar/types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PaginatedResult } from '../pagination/index.js';
import { requireContext } from '../tenant/tenant-context.js';
import type { RequestContext } from '../types/request-context.js';

/**
 * Controllers stay thin: read input, call a service, shape the response.
 * No business rules here, and no Prisma. If a controller needs a branch on
 * domain state, that branch belongs in the service.
 */
export abstract class BaseController {
  protected context(_request: FastifyRequest): RequestContext {
    return requireContext();
  }

  /** 200 with the standard envelope. */
  protected ok<T>(reply: FastifyReply, data: T): ApiSuccess<T> {
    void reply;
    return { ok: true, data };
  }

  protected created<T>(reply: FastifyReply, data: T): ApiSuccess<T> {
    void reply.code(201);
    return { ok: true, data };
  }

  /** 204: nothing to say, and nothing for the client to parse. */
  protected noContent(reply: FastifyReply): void {
    void reply.code(204).send();
  }

  protected paginated<T>(reply: FastifyReply, result: PaginatedResult<T>): ApiSuccess<T[]> {
    void reply;
    const meta: { pagination: PaginationMeta } = { pagination: result.pagination };
    return { ok: true, data: result.items, meta };
  }
}
