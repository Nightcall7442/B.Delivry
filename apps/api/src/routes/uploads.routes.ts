/**
 * /uploads — images from the apps, and /storage — the files back out when the
 * local provider is in use.
 *
 * The body is the image itself (content-type image/*), not a multipart form:
 * every client can send a Blob, and nothing here needs a parser dependency.
 */
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { PERMISSION } from '@bazar/constants';
import { requireContext } from '../common/tenant/tenant-context.js';
import { z } from 'zod';
import type { Container } from '../app/container.js';
import { STORAGE_FOLDER, type StorageFolder } from '../config/storage.config.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validation.middleware.js';
import { createWorker, type Worker } from 'tesseract.js';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** What an app may upload on its own: no product images or documents from a phone. */
const APP_FOLDERS: readonly StorageFolder[] = [
  STORAGE_FOLDER.WEIGHING,
  STORAGE_FOLDER.DELIVERY_PROOFS,
  STORAGE_FOLDER.AVATARS,
  STORAGE_FOLDER.REVIEWS,
];

/** Catalogue pictures: only for accounts that may edit the catalogue. */
const CATALOGUE_FOLDERS: readonly StorageFolder[] = [
  STORAGE_FOLDER.PRODUCT_IMAGES,
  STORAGE_FOLDER.STORE_IMAGES,
];

const folderParams = z.object({
  folder: z.enum([...APP_FOLDERS, ...CATALOGUE_FOLDERS] as [string, ...string[]]),
});

/**
 * A photo of a paper shopping list → its text. Tesseract with ru + uz (Latin)
 * models, loaded once per process (~5 s cold, language data cached under
 * apps/api/.tessdata). ponytail: printed and neat block letters only — real
 * handwriting needs a vision model; the parser copes with the noise it gets.
 */
let ocr: Promise<Worker> | null = null;
const ocrWorker = (): Promise<Worker> =>
  (ocr ??= createWorker(['rus', 'uzb'], 1, { cachePath: '.tessdata' }));

export function uploadsRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    const { storage, config } = container;
    app.addHook('onClose', async () => {
      if (ocr) await (await ocr).terminate();
    });

    app.post('/recognize', { preHandler: [requireAuth] }, async (request, reply) => {
      if (!Buffer.isBuffer(request.body)) {
        return reply.code(415).send({
          ok: false,
          error: { code: 'VALIDATION', message: 'Send the image bytes as image/jpeg or image/png' },
        });
      }
      const worker = await ocrWorker();
      const { data } = await worker.recognize(request.body);
      return reply.send({ ok: true, data: { text: data.text.trim() } });
    });

    app.addContentTypeParser(
      Object.keys(EXTENSION),
      { parseAs: 'buffer', bodyLimit: config.storage.maxUploadBytes },
      (_request, body, done) => done(null, body),
    );

    app.post(
      '/:folder',
      { preHandler: [requireAuth, validate({ params: folderParams })] },
      async (request, reply) => {
        const { folder } = request.params as { folder: StorageFolder };
        if (
          CATALOGUE_FOLDERS.includes(folder) &&
          !(requireContext().user?.permissions ?? []).includes(PERMISSION.PRODUCT_WRITE)
        ) {
          return reply.code(403).send({
            ok: false,
            error: { code: 'FORBIDDEN', message: 'Catalogue pictures need product:write' },
          });
        }
        const contentType = (request.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
        const extension = EXTENSION[contentType];
        if (extension === undefined || !Buffer.isBuffer(request.body)) {
          return reply.code(415).send({
            ok: false,
            error: {
              code: 'VALIDATION',
              message: 'Send the image bytes as image/jpeg, image/png or image/webp',
            },
          });
        }
        const result = await storage.upload({
          folder,
          key: `${randomUUID()}.${extension}`,
          body: request.body,
          contentType,
        });
        return reply
          .code(201)
          .send({ ok: true, data: { url: result.url, key: result.key, size: result.size } });
      },
    );
  };
}

/** Files written by the local provider, served straight from disk (dev only). */
export function storageRouteGroup(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    if (container.config.storage.provider !== 'local') return;
    const root = resolve(process.cwd(), '.storage');

    app.get('/:folder/:key', async (request, reply) => {
      const { folder, key } = request.params as { folder: string; key: string };
      const path = resolve(join(root, folder, key));
      if (!path.startsWith(root) || key.includes('..')) return reply.code(404).send();
      try {
        const info = await stat(path);
        if (!info.isFile()) return reply.code(404).send();
      } catch {
        return reply.code(404).send();
      }
      const type =
        Object.entries(EXTENSION).find(([, ext]) => `.${ext}` === extname(path))?.[0] ??
        'application/octet-stream';
      return reply
        .header('content-type', type)
        .header('cache-control', 'public, max-age=31536000, immutable')
        .send(createReadStream(path));
    });
  };
}
