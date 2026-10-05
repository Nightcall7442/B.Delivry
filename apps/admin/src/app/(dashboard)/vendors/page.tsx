'use client';

import type { VendorRowDto, VendorStatus } from '@bazar/types';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

const LEGAL: Record<VendorRowDto['legalType'], string> = {
  UNREGISTERED: 'без регистрации',
  INDIVIDUAL_ENTREPRENEUR: 'ИП',
  LLC: 'ООО',
};

/**
 * «Стать продавцом»: applications from the app and the site. Approving lets the seller stock a stall
 * in Bazar Seller from their next sign-in (the VENDOR role comes with it); their stalls still need
 * their own review on «Точки» before customers see them.
 */
export default function VendorsPage() {
  const [pending, setPending] = useState<VendorRowDto[]>([]);
  const [active, setActive] = useState<VendorRowDto[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = () => {
    api()
      .vendors.list({ status: 'PENDING', pageSize: 100 })
      .then((page) => setPending(page.items))
      .catch(() => undefined);
    api()
      .vendors.list({ status: 'ACTIVE', pageSize: 100 })
      .then((page) => setActive(page.items))
      .catch(() => undefined);
  };
  useEffect(load, []);

  const decide = async (row: VendorRowDto, status: VendorStatus, said: string) => {
    try {
      await api().vendors.setStatus(row.id, status);
      setNote(`${row.displayName}: ${said}`);
      load();
    } catch {
      setNote('Не сохранилось');
    }
  };

  const Table = ({ rows, pendingRows }: { rows: VendorRowDto[]; pendingRows: boolean }) => (
    <div className="card mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left">
          <tr>
            <th className="px-4 py-3">Лавка</th>
            <th className="px-4 py-3">Продавец</th>
            <th className="px-4 py-3">{pendingRows ? 'Подана' : 'Точек'}</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-3 text-ink-muted" colSpan={4}>
                Пусто
              </td>
            </tr>
          ) : null}
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2">
                <div className="font-medium">{row.displayName}</div>
                <div className="text-xs text-ink-muted">
                  {LEGAL[row.legalType]}
                  {row.taxId ? ` · ИНН ${row.taxId}` : ''}
                </div>
              </td>
              <td className="px-4 py-2 tabular-nums">
                {row.legalName}
                <div className="text-xs text-ink-muted">{row.phone}</div>
              </td>
              <td className="px-4 py-2 tabular-nums">
                {pendingRows
                  ? new Date(row.createdAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                    })
                  : row._count.stores}
              </td>
              <td className="px-4 py-2 text-right">
                {pendingRows ? (
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void decide(row, 'ACTIVE', 'одобрен, может заводить точки')}
                    >
                      Одобрить
                    </button>
                    <button
                      type="button"
                      className="btn-secondary ml-2"
                      onClick={() => void decide(row, 'REJECTED', 'отказано')}
                    >
                      Отказать
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void decide(row, 'SUSPENDED', 'приостановлен')}
                  >
                    Приостановить
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-headline font-extrabold">Продавцы</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Заявки «Стать продавцом» из приложения и с сайта. Позвоните, договоритесь о месте и комиссии
        — и одобрите: продавец сможет завести точку в Bazar Seller.
      </p>
      {/* On the ground, not on paper: ochre as text, the one accent that reads there. */}
      {note ? <p className="mt-2 text-sm text-[var(--ochre-light)]">{note}</p> : null}
      <h2 className="mt-4 font-display text-lead font-bold">Заявки</h2>
      <Table rows={pending} pendingRows />
      <h2 className="mt-6 font-display text-lead font-bold">Работают</h2>
      <Table rows={active} pendingRows={false} />
    </div>
  );
}
