/**
 * Discount requests ("торг").
 */
import { z } from 'zod';

import { idSchema, optionalText } from './common.schema.js';

export const createHaggleSchema = z.object({
  productId: idSchema,
  askedPrice: z.number().int().positive(),
  message: optionalText(200),
});

export const answerHaggleSchema = z.object({
  accept: z.boolean(),
  price: z.number().int().positive().optional(),
  reply: optionalText(200),
});

export type CreateHaggleInput = z.infer<typeof createHaggleSchema>;
export type AnswerHaggleInput = z.infer<typeof answerHaggleSchema>;
