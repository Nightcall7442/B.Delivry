/**
 * Bazaar stories on the web: rings for every stall (green = this morning's
 * counter photo), a full-screen viewer with auto-advance, arrows and Escape.
 */
'use client';

import { createT } from '@bazar/i18n';
import { tr, type MapStoreDto } from '@bazar/storefront';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Photo } from '@/components/go/photo';

const photoOf = (store: MapStoreDto) => store.counterPhotoUrl ?? store.coverUrl ?? null;
/** «Зелёный ряд, Чорсу» → ['Зелёный ряд', 'Чорсу']: the stall first, the bazaar under it. */
const stall = (name: string) => {
  const [head, ...rest] = name.split(/,\s*/);
  return [head ?? name, rest.join(', ')] as const;
};

export function Stories({ stores, locale }: { stores: readonly MapStoreDto[]; locale: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const rows = stores.filter((store) => photoOf(store));
  if (rows.length === 0) return null;
  return (
    <>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
        {rows.map((store, i) => (
          <button
            key={store.id}
            type="button"
            onClick={() => setOpen(i)}
            className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 focus-visible:outline-none"
          >
            <span
              className={`rounded-full p-[3px] ${store.counterPhotoUrl ? 'bg-gradient-to-tr from-brand-500 to-brand-300' : 'bg-line'}`}
            >
              <span className="block rounded-full bg-surface p-[2px]">
                <Photo
                  src={photoOf(store)}
                  alt=""
                  sizes="64px"
                  className="h-14 w-14 rounded-full"
                />
              </span>
            </span>
            <span className="w-full text-center text-[11px] font-semibold leading-[13px]">
              <span className="line-clamp-2">{stall(tr(store.name, locale))[0]}</span>
              {stall(tr(store.name, locale))[1] ? (
                <span className="block truncate font-medium text-ink-muted">
                  {stall(tr(store.name, locale))[1]}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      {open !== null ? (
        <StoryViewer stores={rows} start={open} locale={locale} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

export function StoryViewer({
  stores,
  start,
  locale,
  onClose,
  cta = true,
}: {
  stores: readonly MapStoreDto[];
  start: number;
  locale: string;
  onClose: () => void;
  /** Off when the story is opened from the store's own page. */
  cta?: boolean;
}) {
  const t = createT(locale);
  const [index, setIndex] = useState(start);
  const [paused, setPaused] = useState(false);
  const held = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const store = stores[index]!;
  const next = () => (index + 1 < stores.length ? setIndex(index + 1) : onClose());
  const prev = () => setIndex((i) => Math.max(i - 1, 0));
  // A tap flips the story; a hold (pointer down > 250 ms) only pauses it.
  const tap = (fn: () => void) => () => {
    if (Date.now() - held.current < 250) fn();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, stores.length - 1));
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stores.length, onClose]);
  const time = store.counterPhotoAt
    ? new Date(store.counterPhotoAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-0 md:p-8">
      <div
        className="relative h-full w-full max-w-[430px] select-none overflow-hidden bg-[#0B1020] md:h-[min(90vh,820px)] md:rounded-3xl"
        onPointerDown={() => {
          held.current = Date.now();
          setPaused(true);
        }}
        onPointerUp={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        onTouchStart={(event) => {
          const point = event.touches[0];
          touch.current = point ? { x: point.clientX, y: point.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const from = touch.current;
          const point = event.changedTouches[0];
          touch.current = null;
          if (!from || !point) return;
          const dx = point.clientX - from.x;
          const dy = point.clientY - from.y;
          if (dy > 90 && dy > Math.abs(dx)) onClose();
          else if (dx < -50) next();
          else if (dx > 50) prev();
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoOf(store) ?? ''}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />
        <button
          type="button"
          className="absolute inset-y-0 left-0 w-1/3"
          aria-label="←"
          onClick={tap(prev)}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 w-2/3"
          aria-label="→"
          onClick={tap(next)}
        />
        <div className="absolute inset-x-3 top-3 flex gap-1">
          {stores.map((row, i) => (
            <span key={row.id} className="h-[3px] flex-1 overflow-hidden rounded bg-white/35">
              <span
                key={`${row.id}-${index}`}
                onAnimationEnd={i === index ? next : undefined}
                className={`block h-full bg-white ${i < index ? 'w-full' : i === index ? `story-fill ${paused ? '[animation-play-state:paused]' : ''}` : 'w-0'}`}
              />
            </span>
          ))}
        </div>
        <div className="absolute inset-x-3 top-8 flex items-center gap-3 text-white">
          <Photo
            src={store.logoUrl ?? photoOf(store)}
            alt=""
            sizes="36px"
            className="h-9 w-9 rounded-full"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold">{tr(store.name, locale)}</p>
            <p className="text-xs text-white/80">
              {time
                ? `${t('store.counterNow')} · ${t('store.counterAt', { time })}`
                : t('store.prep', { minutes: store.preparationMinutes })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative z-10 flex h-9 w-9 items-center justify-center text-2xl"
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-5 text-white">
          {store.ownerName ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/80">
                {t('store.owner')}
              </p>
              <p className="font-display text-2xl font-extrabold">{store.ownerName}</p>
              {store.ownerMotto ? (
                <p className="line-clamp-3 text-base text-white/90">
                  «{tr(store.ownerMotto, locale)}»
                </p>
              ) : null}
            </>
          ) : (
            <p className="font-display text-2xl font-extrabold">{tr(store.name, locale)}</p>
          )}
          {cta ? (
            <Link
              href={`/${locale}/stores/${store.id}`}
              className="relative z-10 mt-3 flex h-12 items-center justify-center rounded-2xl bg-white font-display font-bold text-brand-deep"
            >
              {t('story.open')}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
