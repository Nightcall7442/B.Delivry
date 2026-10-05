/**
 * A page's <title> in the page's own language: «Savat — Bazar Delivery» on /uz, not the Russian
 * one every page used to export as a constant.
 */
import { createT, type MessageKey } from '@bazar/i18n';
import type { Metadata } from 'next';

export const BRAND = 'Bazar Delivery';

export const titled =
  (key: MessageKey) =>
  async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => ({
    title: `${createT((await params).locale)(key)} — ${BRAND}`,
  });
