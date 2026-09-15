/**
 * Input sanitization (XSS).
 */
import type { FastifyInstance } from 'fastify';

/**
 * Strips control and invisible characters, and trims strings. It does NOT try
 * to strip HTML: escaping belongs at the point of rendering, and a sanitizer
 * here would quietly corrupt legitimate text (a store called "M&M", an address
 * with angle brackets) while giving false confidence.
 *
 * What it does prevent is log injection via control codes, and the zero-width
 * and bidi-override tricks used to make two different names look identical.
 *
 * Cc = control characters, Cf = format characters (zero-width, bidi, BOM).
 */
const CONTROL_CHARS = /\p{Cc}/gu;
const INVISIBLE = /\p{Cf}/gu;

const MAX_DEPTH = 8;

function clean(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.replace(CONTROL_CHARS, '').replace(INVISIBLE, '').trim();
  }
  if (depth >= MAX_DEPTH) return value;
  // Raw bodies (image uploads) are bytes, not text: copying them key by key
  // would turn a Buffer into a plain object.
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // Block prototype pollution before the object reaches any merge.
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      out[key] = clean(item, depth + 1);
    }
    return out;
  }
  return value;
}

export function registerSanitize(app: FastifyInstance): void {
  app.addHook('preValidation', async (request) => {
    if (request.body !== undefined && request.body !== null) {
      request.body = clean(request.body);
    }
    if (request.query !== undefined && request.query !== null) {
      request.query = clean(request.query);
    }
  });
}
