/**
 * `z.coerce.boolean()` is `Boolean(value)`, and every non-empty string is truthy: `?published=false`,
 * `?unreadOnly=false` and `?activeOnly=false` all arrived as true. For the reviews list that turned
 * a moderator's "show the hidden ones" into "show the published ones", and for the promotions list
 * "show the drafts too" into "only what is running"; for notifications it hid read messages from
 * someone who asked for all of them. The three schemas now read the word.
 */
import { describe, expect, it } from 'vitest';
import { notificationListQuerySchema } from '../../src/modules/notifications/schemas/index.js';
import { promotionListQuerySchema } from '../../src/modules/promotions/schemas/index.js';
import { reviewsListQuerySchema } from '../../src/modules/reviews/schemas/index.js';

const CASES = [
  ['reviews', reviewsListQuerySchema, 'published'],
  ['notifications', notificationListQuerySchema, 'unreadOnly'],
  ['promotions', promotionListQuerySchema, 'activeOnly'],
] as const;

describe.each(CASES)('the %s list flag', (_, schema, flag) => {
  it('reads "false" and "0" as false, "true" and "1" as true', () => {
    for (const word of ['false', '0', 'FALSE']) {
      expect(schema.parse({ [flag]: word })).toMatchObject({ [flag]: false });
    }
    for (const word of ['true', '1', 'True']) {
      expect(schema.parse({ [flag]: word })).toMatchObject({ [flag]: true });
    }
  });

  it('is absent when it was not sent, so the default applies', () => {
    expect(schema.parse({})).not.toHaveProperty(flag);
  });

  it('refuses a word that is neither, instead of guessing', () => {
    expect(schema.safeParse({ [flag]: 'maybe' }).success).toBe(false);
    expect(schema.safeParse({ [flag]: 'yes' }).success).toBe(false);
  });
});
