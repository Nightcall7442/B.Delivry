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
      <h1 className="font-display text-[clamp(30px,4vw,44px)] font-bold leading-none">
        {isVendor ? 'Мои прилавки' : 'Прилавки'}
      </h1>
      <p className="hand mt-2 text-[20px]">
        Цены, остатки, фото и выручка; утром — отметить, что привезли, и разослать покупателям.
      </p>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {stores.map((store, i) => {
          const face = store.counterPhotoUrl ?? store.coverUrl ?? null;
          return (
            <Link
              key={store.id}
              href={`/stores/${store.id}`}
              className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-[#3a2e1c] shadow-[0_18px_40px_rgba(0,0,0,0.4)]"
              style={
                face
                  ? {
                      backgroundImage: `url(${photo(face, 960)})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : undefined
              }
            >
              <span className="absolute inset-0 bg-gradient-to-t from-[rgba(30,20,8,0.7)] via-transparent to-transparent" />
              <span
                className="absolute bottom-4 left-4 max-w-[80%] bg-[#fbf5e6] px-3 pb-2 pt-2 text-[#1f1a14] shadow-[0_6px_14px_rgba(0,0,0,0.35)] transition-transform group-hover:-translate-y-1"
                style={{
                  transform: `rotate(${[-1.2, 1, -0.6][i % 3]}deg)`,
                  border: '1px solid var(--paper-edge)',
                }}
              >
                <span className="hand block text-[22px] uppercase leading-none">
                  {tr(store.name, 'ru')}
                </span>
                <span className="mt-1 block text-[12px] text-ink-muted">
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
