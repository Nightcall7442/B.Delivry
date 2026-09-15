'use client';

import { tr } from '@bazar/storefront';
import type { StoreDto } from '@bazar/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';

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
      <h1 className="font-display text-2xl font-extrabold">{isVendor ? 'Мои точки' : 'Точки'}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Цены, остатки, фото и выручка; утром — отметить, что привезли, и разослать покупателям.
      </p>
      <div className="card mt-4 divide-y divide-line">
        {stores.map((store) => (
          <Link
            key={store.id}
            href={`/stores/${store.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-sand-50"
          >
            <span>
              <span className="block font-medium">{tr(store.name, 'ru')}</span>
              <span className="block text-xs text-ink-muted">{store.address}</span>
            </span>
            <span className="text-sm text-brand-700">Открыть →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
