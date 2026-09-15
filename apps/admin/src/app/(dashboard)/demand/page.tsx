'use client';

import { Demand } from '@/features/demand';

export default function DemandPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Спрос</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Что покупатели ищут и диктуют в списках — и чего у нас нет. Второй источник выручки для
        продавцов: они видят то же по своей точке.
      </p>
      <Demand />
    </div>
  );
}
