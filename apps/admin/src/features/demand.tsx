'use client';

import type { DemandReportDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/** What people searched for, and the queries the catalogue could not answer. */
export function Demand({ storeId }: { storeId?: string }) {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<DemandReportDto | null>(null);
  useEffect(() => {
    api()
      .analytics.demand({ days, ...(storeId ? { storeId } : {}) })
      .then(setReport)
      .catch(() => setReport(null));
  }, [days, storeId]);

  const List = ({
    title,
    rows,
    hint,
  }: {
    title: string;
    rows: DemandReportDto['top'];
    hint: string;
  }) => (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-ink-muted">{title}</div>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {rows.length === 0 ? <li className="py-2 text-ink-muted">Пока пусто</li> : null}
        {rows.map((row) => (
          <li key={row.query} className="flex items-center justify-between py-2">
            <span>{row.query}</span>
            <span className="tabular-nums text-ink-muted">
              {row.count} × {row.results === 0 ? '· нет в каталоге' : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            type="button"
            className={days === n ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setDays(n)}
          >
            {n} дней
          </button>
        ))}
      </div>
      {report ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <List
            title="Чего просят, а нет"
            rows={report.unmet}
            hint="Поиск и списки покупателей, на которые каталог ничего не ответил — что привезти завтра."
          />
          <List title="Что ищут чаще всего" rows={report.top} hint="Все запросы за период." />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Считаем…</p>
      )}
    </div>
  );
}
