'use client';

import { photo, tr } from '@bazar/storefront';
import type { StoreDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

/** The stalls as the customer sees them — the counter photo with a cardboard sign hung on it. */
export default function StoresPage() {
  const { isVendor } = useAuth();
  const [stores, setStores] = useState<StoreDto[]>([]);
  useEffect(() => {
    (isVendor
      ? api().stores.mine()
      : api()
          .stores.list({ pageSize: 100 })
          .then((p) => p.items)
    )
      .then(setStores)
      .catch(() => undefined);
  }, [isVendor]);
  return (
    <div>
      <h1 className="font-display text-headline font-bold">
        {isVendor ? 'Мои прилавки' : 'Прилавки'}
      </h1>
      <p className="mt-2 text-lead">
        Цены, остатки, фото и выручка; утром — отметить, что привезли, и разослать покупателям.
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {stores.map((store, i) => {
          const face = store.counterPhotoUrl ?? store.coverUrl ?? null;
          return (
            // A photograph lifted off the ground; without one, the painted board over the door.
            <Link
              key={store.id}
              href={`/stores/${store.id}`}
              className="group relative block aspect-[4/3] overflow-hidden rounded-photo bg-[var(--board)] shadow-paper"
            >
              {face ? (
                <span
                  className="photo-grade absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${photo(face, 960)})` }}
                />
              ) : null}
              <span className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--ground-deep-rgb)/0.7)] via-transparent to-transparent" />
              {/* The shop's sign: paper by its corners, flat on the photo, the name in Alegreya. */}
              <span
                className="absolute bottom-4 left-4 max-w-[80%] rounded-paper bg-[var(--paper)] px-3 pb-2 pt-2 text-[var(--ink-paper)] transition-transform group-hover:-translate-y-1"
                style={{
                  transform: `rotate(${[-1.2, 1, -0.6][i % 3]}deg)`,
                  border: '1px solid var(--paper-edge)',
                }}
              >
                <span className="font-display block text-title font-bold">
                  {tr(store.name, 'ru')}
                </span>
                {/* By name: `.on-ground` turns text-ink-muted cream anywhere off a `.card`. */}
                <span className="mt-1 block text-xs text-[var(--ink-soft)]">
                  {store.ownerName ? `${store.ownerName} · ` : ''}
                  {store.address}
                </span>
                {!store.isOpen ? <span className="badge mt-1 text-brand-600">закрыто</span> : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
