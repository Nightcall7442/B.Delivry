/**
 * Zod body/query/params validation helper.
 */
import type { FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z, type ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '../common/errors/domain.errors.js';

/** Zod issues to the per-field map the clients render next to inputs. */
export function toFieldErrors(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fields[path] ??= []).push(issue.message);
  }
  return fields;
}

/** Parses and throws a 422 with field errors, instead of Zod's raw shape. */
export function parseOrThrow<T extends ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new ValidationError(toFieldErrors(result.error));
  return result.data;
}

export interface RequestSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validation happens here and only here, at the edge. Below this line every
 * value is already the right type and shape, which is what lets services take
 * typed inputs instead of re-checking everything defensively.
 *
 * The parsed result replaces the raw input, so transforms (phone
 * normalization, coercions, defaults) actually reach the handler.
 */
export function validate(schemas: RequestSchemas): preHandlerHookHandler {
  return async (request) => {
    if (schemas.params !== undefined) {
      request.params = parseOrThrow(schemas.params, request.params);
    }
    if (schemas.query !== undefined) {
      request.query = parseOrThrow(schemas.query, request.query);
    }
    if (schemas.body !== undefined) {
      request.body = parseOrThrow(schemas.body, request.body);
    }
  };
}

/** Typed accessors so handlers do not cast on every line. */
export const body = <T>(request: FastifyRequest): T => request.body as T;
export const query = <T>(request: FastifyRequest): T => request.query as T;
export const params = <T>(request: FastifyRequest): T => request.params as T;
