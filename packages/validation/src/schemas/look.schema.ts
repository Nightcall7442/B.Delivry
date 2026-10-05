/**
 * «Покажите товар»: the customer names the good, the stall answers with a photograph it uploaded.
 */
import { z } from 'zod';

import { httpUrl, idSchema } from './common.schema.js';

export const askLookSchema = z.object({ productId: idSchema });

export const answerLookSchema = z.object({ photoUrl: httpUrl });

export type AskLookInput = z.infer<typeof askLookSchema>;
export type AnswerLookInput = z.infer<typeof answerLookSchema>;
