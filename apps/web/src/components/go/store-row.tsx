import Link from 'next/link';

import { Basket, Chevron } from '@/components/go/icons';
import { Photo } from '@/components/go/photo';
import { type MapStoreDto, storeTypeLabel, tagLabel, tr } from '@bazar/storefront';
import { createT } from '@bazar/i18n';

/** A paid spot on the home list, still running. */
export const promoted = (store: { promotedUntil: string | null }): boolean =>
  store.promotedUntil !== null && Date.parse(store.promotedUntil) > Date.now();

export function StoreRow({
  store,
  locale,
  etaMinutes,
}: {
  store: MapStoreDto;
  locale: string;
  etaMinutes: number | null;
}) {
  const t = createT(locale);
  const tags = tagLabel(locale);
  const meta = [
    storeTypeLabel(locale)[store.type],
    `★ ${store.rating.toFixed(1)}`,
    etaMinutes
      ? t('common.minutes', { minutes: etaMinutes })
      : t('store.prep', { minutes: store.preparationMinutes }),
    ...store.tags.map((tag) => tags[tag]),
  ];
  return (
    <Link href={`/${locale}/stores/${store.id}`} className="go-row">
      <Photo
        src={store.coverUrl}
        alt=""
        sizes="56px"
        className="h-14 w-14 shrink-0 rounded-2xl"
        fallback={<Basket />}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-medium">{tr(store.name, locale)}</span>
          {promoted(store) ? (
            <span className="shrink-0 rounded-md bg-saffron-100 px-1.5 py-0.5 text-[11px] text-saffron-600">
              {t('home.ad')}
            </span>
          ) : null}
          {!store.isOpen ? (
            <span className="shrink-0 rounded-md bg-surface-mute px-1.5 py-0.5 text-[11px] text-ink-muted">
              {t('store.closed')}
            </span>
          ) : null}
        </span>
        <span className="block truncate text-sm text-ink-muted">{meta.join(' · ')}</span>
      </span>
      <Chevron />
    </Link>
  );
}

/** A stall as a tile: the counter photo, the name, rating and minutes — the same card as a category. */
export function StoreCard({
  store,
  locale,
  etaMinutes,
}: {
  store: MapStoreDto;
  locale: string;
  etaMinutes: number | null;
}) {
  const t = createT(locale);
  const tag = !store.isOpen ? t('store.closed') : promoted(store) ? t('home.ad') : null;
  return (
    <Link
      href={`/${locale}/stores/${store.id}`}
      className="tile group block w-44 shrink-0 p-1.5 transition-transform hover:-translate-y-0.5 md:w-52"
    >
      <span className="relative block">
        <Photo
          src={store.counterPhotoUrl ?? store.coverUrl}
          alt=""
          sizes="208px"
          className="aspect-[16/10] rounded-2xl"
          fallback={<Basket />}
        />
        {tag ? (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-neutral-900">
            {tag}
          </span>
        ) : null}
      </span>
      <span className="block px-1.5 pb-1 pt-2">
        <span className="line-clamp-2 text-xs font-bold leading-4 md:text-sm">
          {tr(store.name, locale)}
        </span>
        <span className="block text-[11px] text-ink-muted">
          ★ {store.rating.toFixed(1)}
          {etaMinutes ? ` · ${t('common.minutes', { minutes: etaMinutes })}` : ''}
        </span>
      </span>
    </Link>
  );
}
