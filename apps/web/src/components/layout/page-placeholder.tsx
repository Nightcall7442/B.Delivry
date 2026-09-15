/**
 * "Coming soon" in the GO frame, so an unfinished screen still feels like the
 * same app instead of a different site.
 */
'use client';

import Link from 'next/link';

import { GoShell } from '@/components/go/go-shell';
import { DEFAULT_POINT, useAddress } from '@/features/address';

export function PagePlaceholder({ title, locale = 'ru' }: { title: string; locale?: string }) {
  const { address } = useAddress();
  return (
    <GoShell
      locale={locale}
      back={`/${locale}`}
      peek={0.34}
      map={{ center: address?.point ?? DEFAULT_POINT, zoom: 12, interactive: false }}
      header={<h1 className="font-display text-[22px] font-extrabold leading-7">{title}</h1>}
      footer={
        <Link href={`/${locale}`} className="btn-go-secondary">
          На главную
        </Link>
      }
    >
      <p className="mt-2 text-ink-muted">Раздел в разработке.</p>
    </GoShell>
  );
}
