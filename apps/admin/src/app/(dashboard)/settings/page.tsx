'use client';

import type { TenantSettingsDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

type Switch = 'autoConfirmOrders' | 'autoAssignCouriers';

const SWITCHES: { key: Switch; title: string; on: string; off: string }[] = [
  {
    key: 'autoConfirmOrders',
    title: 'Подтверждать заказы автоматически',
    on: 'Заказ «наличными» подтверждается в момент оформления и сразу уходит на поиск курьера — без шага «Подтвердить» здесь.',
    off: 'Каждый заказ ждёт, пока сотрудник или продавец нажмёт «Подтвердить»; курьеры не видят его до этого.',
  },
  {
    key: 'autoAssignCouriers',
    title: 'Искать курьера автоматически',
    on: 'Подтверждённый заказ сразу предлагается ближайшим курьерам онлайн.',
    off: 'Курьера подбирает только диспетчер: кнопкой «Назначить» в заказе.',
  },
];

/** The switches of the order flow: what the platform does by itself and what waits for a person. */
export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettingsDto | null>(null);
  const [busy, setBusy] = useState<Switch | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api()
      .tenants.settings()
      .then(setSettings)
      .catch(() => setNote('Не удалось загрузить настройки'));
  }, []);

  const flip = async (key: Switch, value: boolean) => {
    if (!settings) return;
    setBusy(key);
    setNote(null);
    try {
      setSettings(await api().tenants.updateSettings({ [key]: value }));
      setNote(
        'Сохранено. Действует на новые заказы; настройки кэшируются на сервере до пяти минут.',
      );
    } catch {
      setNote('Не сохранилось — проверьте связь и права');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h1 className="font-display text-headline font-extrabold">Настройки</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Что платформа делает сама, а что ждёт человека. Переключение действует на заказы, которые
        оформят после него.
      </p>
      <div className="card mt-4 grid max-w-2xl gap-4 p-4">
        {SWITCHES.map((item) => {
          const enabled = settings?.[item.key] ?? false;
          return (
            <label key={item.key} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={enabled}
                disabled={!settings || busy !== null}
                onChange={(event) => void flip(item.key, event.target.checked)}
              />
              <span>
                <span className="block font-bold">{item.title}</span>
                <span className="block text-sm text-ink-muted">
                  {settings ? (enabled ? item.on : item.off) : 'Загружаем…'}
                </span>
              </span>
            </label>
          );
        })}
        {note ? <p className="text-sm text-brand-700">{note}</p> : null}
      </div>
    </div>
  );
}
