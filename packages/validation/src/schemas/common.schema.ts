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

export const imageSchema = z.object({
  url: z.string().url(),
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
