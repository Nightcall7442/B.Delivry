/**
 * Zod schemas: phone.
 */
import { UZ_PHONE_REGEX } from '@bazar/constants';
import { normalizeUzPhone } from '@bazar/utils';
import { z } from 'zod';

/**
 * Accepts any format a human types and hands the rest of the system the
 * canonical +998XXXXXXXXX. Normalizing here, at the edge, is what keeps
 * "same phone, different formatting" from creating two accounts.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeUzPhone(value);
    if (normalized === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid Uzbek phone number' });
      return z.NEVER;
    }
    return normalized;
  });

/** For data already stored in canonical form. */
export const normalizedPhoneSchema = z.string().regex(UZ_PHONE_REGEX);
