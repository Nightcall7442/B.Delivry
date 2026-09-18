'use client';

import { useParams } from 'next/navigation';

import { BazaarNotFound } from '@/components/bazar/support';

export default function LocaleNotFound() {
  const params = useParams<{ locale?: string }>();
  return <BazaarNotFound locale={params.locale === 'uz' ? 'uz' : 'ru'} />;
}
