/**
 * Smaller answers for a bad connection: «nothing changed» in a few hundred bytes, and what did
 * change gzipped or brotli-ed.
 *
 * The apps poll (the stall's orders every few seconds, the courier's offers) and a phone on a
 * bazaar's mobile data pays for every byte. A list that did not change costs the same as one that
 * did unless the server can say «same as before»: every JSON GET carries a validator, and a request
 * that brings it back gets a 304 with no body. Whatever is still sent is compressed — JSON of this
 * shape shrinks five to six times.
 */
import { createHash } from 'node:crypto';
import { constants as zlib } from 'node:zlib';
import compress from '@fastify/compress';
import type { FastifyInstance } from 'fastify';

/** Under this a validator saves nothing: the headers outweigh the body. */
const MIN_ETAG_CHARS = 256;
/** Under this a compressed body is no smaller than the headers it needs. */
const COMPRESS_THRESHOLD_BYTES = 1024;

/** `W/"abc"` → `abc`: weak comparison, which is what a conditional GET asks for. */
const opaqueTag = (tag: string): string => tag.trim().replace(/^W\//, '');

/** Does an `If-None-Match` header (a list of tags, or `*`) name this tag? */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  if (header.trim() === '*') return true;
  const wanted = opaqueTag(etag);
  return header.split(',').some((tag) => opaqueTag(tag) === wanted);
}

export function etagOf(payload: string): string {
  return `W/"${createHash('sha1').update(payload).digest('base64url').slice(0, 22)}"`;
}

export async function registerResponseSize(app: FastifyInstance): Promise<void> {
  // Before the compressor: the tag is made from the JSON itself, not from its gzip, so it is the
  // same whichever encoding the client accepts — and a 304 skips the compressor altogether.
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.method !== 'GET' || reply.statusCode !== 200) return payload;
    // JSON replies reach this hook already serialised; streams and files are left as they are.
    if (typeof payload !== 'string' || payload.length < MIN_ETAG_CHARS) return payload;
    if (reply.hasHeader('etag')) return payload;

    const etag = etagOf(payload);
    void reply.header('etag', etag);
    // Stored by the client but asked about every time: a signed-in answer is the person's own, and
    // the lists change under the poll. A handler that set its own policy keeps it.
    if (!reply.hasHeader('cache-control')) void reply.header('cache-control', 'private, no-cache');

    if (!matchesIfNoneMatch(request.headers['if-none-match'], etag)) return payload;
    void reply.code(304);
    void reply.removeHeader('content-type');
    void reply.removeHeader('content-length');
    return null;
  });

  await app.register(compress, {
    global: true,
    threshold: COMPRESS_THRESHOLD_BYTES,
    encodings: ['br', 'gzip', 'deflate'],
    // Brotli's default quality (11) is for files compressed once and served for years; per request
    // it costs more CPU than the bytes it saves. 4 is within a few percent of gzip -6 on JSON, at
    // a fraction of the time.
    brotliOptions: { params: { [zlib.BROTLI_PARAM_QUALITY]: 4 } },
    zlibOptions: { level: 6 },
  });
}
