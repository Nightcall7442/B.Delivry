'use client';

import type { CustomerDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/** B2B: applications from cafés and canteens; approving sets the invoice credit. */
export default function CompaniesPage() {
  const [pending, setPending] = useState<CustomerDto[]>([]);
  const [approved, setApproved] = useState<CustomerDto[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { days: string; limit: string }>>({});
  const [note, setNote] = useState<string | null>(null);

  const load = () => {
    api()
      .customers.list({ business: 'pending', pageSize: 100 })
      .then((page) => setPending(page.items))
      .catch(() => undefined);
    api()
      .customers.list({ business: 'approved', pageSize: 100 })
      .then((page) => setApproved(page.items))
      .catch(() => undefined);
  };
  useEffect(load, []);

  const draft = (row: CustomerDto) =>
    drafts[row.id] ?? {
      days: String(row.creditDays || 14),
      limit: String(Math.round(row.creditLimit / 100) || 3_000_000),
    };
  const save = async (row: CustomerDto, approve: boolean) => {
    const d = draft(row);
    try {
      await api().customers.setBusiness(row.id, {
        approved: approve,
        creditDays: Number(d.days),
        creditLimit: Math.round(Number(d.limit) * 100),
      });
      setNote(
        approve ? `${row.companyName}: оплата по счёту включена` : `${row.companyName}: отключено`,
      );
      load();
    } catch {
      setNote('Не сохранилось');
    }
  };

  const Table = ({ rows, approvedRows }: { rows: CustomerDto[]; approvedRows: boolean }) => (
    <div className="card mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-4 py-3">Компания</th>
            <th className="px-4 py-3">Контакт</th>
            <th className="px-4 py-3">Отсрочка, дн.</th>
            <th className="px-4 py-3">Лимит, сум</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-ink-muted" colSpan={5}>
                Пусто
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2">
                <div className="font-medium">{row.companyName}</div>
                <div className="text-xs text-ink-muted">ИНН {row.companyInn}</div>
              </td>
              <td className="px-4 py-2 tabular-nums">
                {row.firstName ?? ''} {row.phone}
                <div className="text-xs text-ink-muted">
                  заказов: {row.orderCount}
                  {approvedRows ? ` · лимит ${formatMoney(row.creditLimit)}` : ''}
                </div>
              </td>
              <td className="px-4 py-2">
                <input
                  className="field w-20 tabular-nums"
                  value={draft(row).days}
                  onChange={(e) =>
                    setDrafts({ ...drafts, [row.id]: { ...draft(row), days: e.target.value } })
                  }
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="field w-32 tabular-nums"
                  value={draft(row).limit}
                  onChange={(e) =>
                    setDrafts({ ...drafts, [row.id]: { ...draft(row), limit: e.target.value } })
                  }
                />
              </td>
              <td className="px-4 py-2 text-right">
                <button type="button" className="btn-primary" onClick={() => void save(row, true)}>
                  {approvedRows ? 'Сохранить' : 'Одобрить'}
                </button>
                {approvedRows ? (
                  <button
                    type="button"
                    className="btn-secondary ml-2"
                    onClick={() => void save(row, false)}
                  >
                    Отключить
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Компании</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Кафе и столовые с оплатой по счёту: заявки ждут одобрения, у одобренных — отсрочка и лимит.
      </p>
      {note ? <p className="mt-2 text-sm text-brand-700">{note}</p> : null}
      <h2 className="mt-4 font-display text-lg font-bold">Заявки</h2>
      <Table rows={pending} approvedRows={false} />
      <h2 className="mt-6 font-display text-lg font-bold">Одобренные</h2>
      <Table rows={approved} approvedRows />
    </div>
  );
}
