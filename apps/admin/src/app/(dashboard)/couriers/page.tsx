'use client';

import type { CourierDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { COURIER_LABEL, VEHICLE_LABEL, ago } from '@/features/labels';
import { api } from '@/lib/api';

export default function CouriersPage() {
  const [couriers, setCouriers] = useState<CourierDto[]>([]);

  useEffect(() => {
    const load = () =>
      api()
        .couriers.list({ pageSize: 100 })
        .then((page) => setCouriers(page.items))
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Курьеры</h1>
      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-4 py-3">Курьер</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Транспорт</th>
              <th className="px-4 py-3">Последний сигнал</th>
              <th className="px-4 py-3 text-right">Доставок</th>
              <th className="px-4 py-3 text-right">★</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {couriers.map((courier) => {
              const label = COURIER_LABEL[courier.status];
              return (
                <tr key={courier.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {courier.firstName} {courier.lastName}
                    </div>
                    <div className="tabular-nums text-ink-muted">{courier.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${label.tone}`}>{label.text}</span>
                    {courier.activeOrderCount > 0 ? (
                      <span className="ml-2 text-ink-muted">
                        {courier.activeOrderCount} в работе
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {courier.neighbour
                      ? 'Сосед · пешком'
                      : (VEHICLE_LABEL[courier.vehicleType] ?? courier.vehicleType)}
                    {courier.verifiedAt === null ? (
                      <button
                        type="button"
                        className="btn-primary ml-2"
                        onClick={() =>
                          api()
                            .couriers.verify(courier.id)
                            .then(() =>
                              setCouriers((rows) =>
                                rows.map((row) =>
                                  row.id === courier.id
                                    ? { ...row, verifiedAt: new Date().toISOString() }
                                    : row,
                                ),
                              ),
                            )
                            .catch(() => undefined)
                        }
                      >
                        Подтвердить
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {ago(courier.lastLocationAt)}
                    {courier.lastLocation ? (
                      <span className="ml-2 tabular-nums text-ink-faint">
                        {courier.lastLocation.lat.toFixed(4)}, {courier.lastLocation.lng.toFixed(4)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{courier.completedOrders}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{courier.rating.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
