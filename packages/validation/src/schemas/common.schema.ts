/**
 * Zod schemas: common.
 */
import { CURRENCY, SUPPORTED_LOCALES, SLUG_REGEX } from '@bazar/constants';
import { z } from 'zod';

export const idSchema = z.string().uuid();

export const slugSchema = z.string().min(1).max(96).regex(SLUG_REGEX, 'Invalid slug');

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export const currencySchema = z.nativeEnum(CURRENCY);

/** Money on the wire: an integer count of minor units, never a float. */
export const moneySchema = z.object({
  amount: z.number().int(),
  currency: currencySchema,
});

export const positiveMoneySchema = moneySchema.extend({
  amount: z.number().int().nonnegative(),
});

/** At least one locale must be filled in, or the record is unnameable. */
export const translatedSchema = z
  .record(z.string(), z.string().trim().min(1).max(500))
  .refine((value) => Object.keys(value).length > 0, 'At least one locale is required');

/**
 * A link a person (or another person's phone) will open or load: a web address only.
 * `z.string().url()` also accepts javascript:, data: and file: ones.
 */
export const httpUrl = z
  .string()
  .url()
  .max(500)
  .regex(/^https?:\/\//i, 'Must be an http(s) link');

export const imageSchema = z.object({
  url: httpUrl,
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().max(200).optional(),
});

export const isoDateSchema = z.string().datetime({ offset: true });

export const dateRangeSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((range) => range.from <= range.to, 'from must not be after to');

/** Trims, then treats an empty string as absent: HTML forms post "" for blanks. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

/**
 * A boolean read from a query string. `z.coerce.boolean()` is `Boolean(value)`, and every
 * non-empty string is truthy: `?availableOnly=false` arrived as true. The words are read as
 * words, and anything else is refused rather than guessed.
 */
export const queryBoolean = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    switch (value.trim().toLowerCase()) {
      case 'true':
      case '1':
        return true;
      case 'false':
      case '0':
        return false;
      default:
        return value;
    }
  },
  z.boolean({ invalid_type_error: 'Expected true or false' }),
);
