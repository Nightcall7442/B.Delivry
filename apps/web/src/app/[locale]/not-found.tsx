'use client';

import { createT } from '@bazar/i18n';
import { hallLight } from '@bazar/storefront';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';

import { BazaarNotFound } from '@/components/bazar/support';

export default function LocaleNotFound() {
  const params = useParams<{ locale?: string }>();
  const locale = params.locale === 'uz' ? 'uz' : 'ru';
  // Rendered on the client, the boundary drops the hall the boot script stamped on <html> — the
  // page lit up in the morning teal at night — and it has no metadata of its own: both put back.
  useEffect(() => {
    document.documentElement.dataset['hall'] = hallLight();
    document.title = `${createT(locale)('notFound.title')} — Bazar Delivery`;
  }, [locale]);
  return <BazaarNotFound locale={locale} />;
}
