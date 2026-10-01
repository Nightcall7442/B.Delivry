/**
 * Links that people store and other people's phones then load or open (a logo, a review photo, a
 * support attachment). `z.string().url()` accepts anything `new URL()` parses, and that includes
 * `javascript:`, `data:` and `file:` links. `httpUrl` is the web address only, and every field that
 * holds such a link uses it.
 */
import { PRODUCT_UNIT } from '@bazar/constants';
import type { ZodTypeAny } from 'zod';
import { describe, expect, it } from 'vitest';

import { httpUrl, imageSchema } from './common.schema.js';
import { actualQuantitiesSchema } from './order.schema.js';
import {
  createCategorySchema,
  createProductSchema,
  updateCategorySchema,
  updateProductSchema,
} from './product.schema.js';
import { createReviewSchema } from './review.schema.js';
import { updateStoreSchema } from './store.schema.js';
import { createTicketSchema, replyTicketSchema } from './support.schema.js';

const ID = '3f2b8c1e-9d4a-4b7e-8a51-2c6d0e9f1a34';
const GOOD = 'https://cdn.bazar-delivery.uz/photos/1.jpg';

/** Parse as a URL, so `.url()` alone lets every one of them through. */
const NOT_WEB_LINKS = [
  'javascript:alert(1)',
  'JavaScript:alert(document.cookie)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'file:///etc/passwd',
  'ftp://example.com/photo.jpg',
  // A web address somewhere inside does not make it one: the scheme is what is checked.
  'javascript:location="https://evil.example/"',
  'data:text/html,<script src=https://evil.example/x.js></script>',
  'xhttps://example.com/photo.jpg',
];

describe('httpUrl', () => {
  it('accepts http and https links', () => {
    for (const link of [
      'http://example.com/a.png',
      'https://example.com/a.png',
      'HTTPS://EXAMPLE.COM/A.PNG',
      'https://cdn.bazar-delivery.uz:8443/img/1.jpg?w=200&h=200#top',
    ]) {
      expect(httpUrl.safeParse(link).success, link).toBe(true);
    }
  });

  it('refuses javascript:, data:, file: and ftp: links, whatever they are called', () => {
    for (const link of NOT_WEB_LINKS) {
      expect(httpUrl.safeParse(link).success, link).toBe(false);
    }
  });

  it('refuses an empty string and text that is not an address', () => {
    for (const link of ['', ' ', 'example.com/a.png', '//example.com/a.png', '/photos/1.jpg']) {
      expect(httpUrl.safeParse(link).success, JSON.stringify(link)).toBe(false);
    }
  });

  it('refuses what is not text at all', () => {
    for (const value of [undefined, null, 5, {}, [GOOD]]) {
      expect(httpUrl.safeParse(value).success, String(value)).toBe(false);
    }
  });

  it('holds a link to 500 characters', () => {
    const origin = 'https://example.com/';
    expect(httpUrl.safeParse(origin + 'a'.repeat(500 - origin.length)).success).toBe(true);
    expect(httpUrl.safeParse(origin + 'a'.repeat(501 - origin.length)).success).toBe(false);
  });
});

// ---------------------------------------------------------------- the fields that hold a link

interface Field {
  name: string;
  schema: ZodTypeAny;
  /** The whole input with `link` in the one field under test: valid whenever `link` is. */
  input: (link: string) => unknown;
  /** Where in the input the issue for a bad link is reported. */
  path: (string | number)[];
}

const review = { orderId: ID, target: 'STORE', targetId: ID, rating: 5 };
const ticket = { topic: 'OTHER', subject: 'Where is my order', body: 'It has not come' };
const product = {
  storeId: ID,
  name: { ru: 'Яблоки' },
  unit: PRODUCT_UNIT.KG,
  price: { amount: 10_000, currency: 'UZS' },
};

const FIELDS: Field[] = [
  // The stall's own pictures: shown to every customer.
  ...(['logoUrl', 'coverUrl', 'counterPhotoUrl', 'ownerPhotoUrl'] as const).map((key): Field => ({
    name: `store update: ${key}`,
    schema: updateStoreSchema,
    input: (link) => ({ [key]: link }),
    path: [key],
  })),
  {
    name: 'review: photoUrls',
    schema: createReviewSchema,
    input: (link) => ({ ...review, photoUrls: [GOOD, link] }),
    path: ['photoUrls', 1],
  },
  {
    name: 'support ticket: attachmentUrls',
    schema: createTicketSchema,
    input: (link) => ({ ...ticket, attachmentUrls: [link] }),
    path: ['attachmentUrls', 0],
  },
  {
    name: 'support reply: attachmentUrls',
    schema: replyTicketSchema,
    input: (link) => ({ body: 'Thank you', attachmentUrls: [GOOD, link] }),
    path: ['attachmentUrls', 1],
  },
  ...(['iconUrl', 'imageUrl'] as const).flatMap((key) => [
    {
      name: `category: ${key}`,
      schema: createCategorySchema,
      input: (link: string) => ({ name: { ru: 'Фрукты' }, [key]: link }),
      path: [key],
    },
    {
      name: `category update: ${key}`,
      schema: updateCategorySchema,
      input: (link: string) => ({ [key]: link }),
      path: [key],
    },
  ]),
  {
    name: 'order weighing: photoUrl',
    schema: actualQuantitiesSchema,
    input: (link) => ({ items: [{ orderItemId: ID, actualQuantity: 2.5, photoUrl: link }] }),
    path: ['items', 0, 'photoUrl'],
  },
  {
    name: 'image: url',
    schema: imageSchema,
    input: (link) => ({ url: link }),
    path: ['url'],
  },
  {
    name: 'product: images[].url',
    schema: createProductSchema,
    input: (link) => ({ ...product, images: [{ url: link }] }),
    path: ['images', 0, 'url'],
  },
  {
    name: 'product update: images[].url',
    schema: updateProductSchema,
    input: (link) => ({ images: [{ url: link }] }),
    path: ['images', 0, 'url'],
  },
];

describe('every field that holds a link', () => {
  for (const field of FIELDS) {
    it(`${field.name}: takes a web link and refuses the rest`, () => {
      // The input around the link is sound, so a refusal below is about the link.
      expect(field.schema.safeParse(field.input(GOOD)).success, 'a web link').toBe(true);

      for (const link of NOT_WEB_LINKS) {
        const result = field.schema.safeParse(field.input(link));
        expect(result.success, link).toBe(false);
        if (!result.success) {
          const paths = result.error.issues.map((issue) => JSON.stringify(issue.path));
          expect(paths, link).toContain(JSON.stringify(field.path));
        }
      }
    });
  }

  it('the store pictures can still be cleared with null, and the weighing photo left out', () => {
    expect(
      updateStoreSchema.safeParse({
        logoUrl: null,
        coverUrl: null,
        counterPhotoUrl: null,
        ownerPhotoUrl: null,
      }).success,
    ).toBe(true);
    expect(
      actualQuantitiesSchema.safeParse({ items: [{ orderItemId: ID, actualQuantity: 2.5 }] })
        .success,
    ).toBe(true);
  });
});
