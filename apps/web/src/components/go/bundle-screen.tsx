/**
 * One recipe set: the dish, what goes in it and from which stalls, one button
 * that puts everything on the cart. Prices come from the live catalogue, so a
 * set is never sold at a stale number.
 */
'use client';

import {
  type Bundle,
  type MapStoreDto,
  photo,
  resolveBundle,
  tr,
  unitLabel,
} from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import { createT } from '@bazar/i18n';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useCartActions, useCartQuantities } from '@/features/cart';

export function BundleScreen({
  bundle,
  products,
  stores,
  locale,
}: {
  bundle: Bundle;
  products: readonly ProductDto[];
  stores: readonly MapStoreDto[];
  locale: string;
}) {
  const t = createT(locale);
  const router = useRouter();
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const [added, setAdded] = useState(false);

  const resolved = useMemo(() => resolveBundle(bundle, products), [bundle, products]);
  const storeById = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const stalls = resolved.storeIds.map((id) => storeById.get(id)).filter(Boolean) as MapStoreDto[];

  const addAll = () => {
    for (const line of resolved.lines) {
      setQuantity(line.product.id, (quantities[line.product.id] ?? 0) + line.quantity);
    }
    setAdded(true);
    setTimeout(() => router.push(`/${locale}/cart`), 400);
  };

  return (
    <GoShell
      locale={locale}
      back={`/${locale}`}
      expanded
      peek={0.82}
      header={
        <div className="relative -mx-4 -mt-2 h-44 overflow-hidden bg-brand-950 text-white">
          <Image
            src={photo(bundle.photo, 960)}
            alt=""
            fill
            sizes="(min-width: 768px) 420px, 100vw"
            unoptimized
            priority
            className="object-cover opacity-90"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-brand-950/95 via-brand-950/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h1 className="font-display text-2xl font-extrabold leading-7 [text-wrap:balance]">
              {tr(bundle.title, locale)}
            </h1>
            <p className="mt-1 text-sm text-white/80">{tr(bundle.description, locale)}</p>
          </div>
        </div>
      }
      footer={
        <button
          type="button"
          className="btn-go justify-between"
          disabled={resolved.lines.length === 0 || added}
          onClick={addAll}
        >
          <span>{added ? t('bundle.added') : t('bundle.addAll')}</span>
          <span>{t.money(resolved.total)}</span>
        </button>
      }
    >
      <p className="mt-3 text-sm text-ink-muted">
        {t.n('bundle.people', bundle.serves)} · {t.n('bundle.products', resolved.lines.length)} ·{' '}
        {stalls.map((store) => tr(store.name, locale)).join(', ')}
      </p>

      <ul className="-mx-3 mt-2">
        {resolved.lines.map((line) => (
          <li key={line.product.id} className="go-row cursor-default hover:bg-transparent">
            <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-sand-100">
              {line.product.images[0] ? (
                <Image
                  src={photo(line.product.images[0].url, 250)}
                  alt=""
                  width={44}
                  height={44}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{tr(line.product.name, locale)}</span>
              <span className="block text-xs text-ink-muted">
                {line.quantity} {unitLabel(locale)[line.product.unit]} ·{' '}
                {tr(storeById.get(line.product.storeId)?.name, locale)}
              </span>
            </span>
            <span className="shrink-0 text-sm tabular-nums">{t.money(line.total)}</span>
          </li>
        ))}
      </ul>
      {resolved.missing.length > 0 ? (
        <p className="mt-2 text-xs text-ink-muted">
          {t.n('bundle.missing', resolved.missing.length)}
        </p>
      ) : null}
      {stalls.length > 1 ? (
        <p className="mt-3 rounded-2xl bg-sand-50 px-4 py-3 text-sm text-ink-muted">
          {t('bundle.multiStall', { count: stalls.length })}
        </p>
      ) : null}
    </GoShell>
  );
}
