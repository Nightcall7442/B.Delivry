/**
 * «Свой продавец»: the stall's note about a customer — one short line, empty to forget it.
 */
import { z } from 'zod';

export const regularNoteSchema = z.object({ note: z.string().trim().max(200) });

export type RegularNoteInput = z.infer<typeof regularNoteSchema>;
