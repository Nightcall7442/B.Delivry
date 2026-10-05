'use client';

import { HALL } from '@bazar/storefront';
import type { TenantDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

type BrandForm = {
  name: string;
  appName: string;
  city: string;
  logoUrl: string;
  primary: string;
  accent: string;
};

/**
 * One labelled input. Declared outside the page: a component made inside it is a new component on
 * every keystroke, and React then remounts the input — the field lost focus after one letter.
 */
function Field({
  label,
  value,
  onChange,
  placeholder,
  swatch,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** A colour field shows the colour beside it. */
  swatch?: boolean;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        {swatch ? (
          <span
            aria-hidden
            className="h-9 w-9 shrink-0 rounded-full border border-line"
            style={{ background: value }}
          />
        ) : null}
        <input
          className="field w-full"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  );
}

/** Own brand: the name, city and two colours another city's bazaar app runs under. */
export default function BrandPage() {
  const [tenant, setTenant] = useState<TenantDto | null>(null);
  const [form, setForm] = useState<BrandForm>({
    name: '',
    appName: '',
    city: '',
    logoUrl: '',
    primary: '',
    accent: '',
  });
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    api()
      .tenants.get()
      .then((row) => {
        setTenant(row);
        setForm({
          name: row.name,
          appName: row.branding?.appName ?? 'bazar',
          city: row.branding?.city ?? '',
          logoUrl: row.branding?.logoUrl ?? '',
          primary: row.branding?.primary ?? HALL.pomegranate,
          accent: row.branding?.accent ?? HALL.ochre,
        });
      })
      .catch(() => undefined);
  }, []);

  const set = (patch: Partial<BrandForm>) => setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    try {
      const updated = await api().tenants.updateBranding({
        name: form.name.trim(),
        branding: {
          appName: form.appName.trim() || 'bazar',
          city: form.city.trim() || null,
          logoUrl: form.logoUrl.trim() || null,
          primary: form.primary.trim() || null,
          accent: form.accent.trim() || null,
        },
      });
      setTenant(updated);
      setNote('Сохранено — сайт покупателя перекрасится при следующей загрузке');
    } catch {
      setNote('Не сохранилось: цвета — hex вида #9E2A2B, ссылка на логотип — полный URL');
    }
  };
  return (
    <div>
      <h1 className="font-display text-headline font-extrabold">Бренд</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">
        Своя марка: домен арендатора ({tenant?.domain ?? 'пока не задан'}) открывает тот же сайт под
        своим именем и цветами. Мобильные приложения берут имя и город отсюда, цвета — при сборке.
      </p>
      <div className="card mt-4 grid max-w-2xl gap-3 p-4 md:grid-cols-2">
        <Field label="Название арендатора" value={form.name} onChange={(name) => set({ name })} />
        <Field
          label="Имя приложения (вордмарк)"
          value={form.appName}
          onChange={(appName) => set({ appName })}
          placeholder="bazar"
        />
        <Field
          label="Город"
          value={form.city}
          onChange={(city) => set({ city })}
          placeholder="Самарканд"
        />
        <Field
          label="Логотип (URL)"
          value={form.logoUrl}
          onChange={(logoUrl) => set({ logoUrl })}
          placeholder="https://…/logo.png"
        />
        <Field
          label="Основной цвет"
          value={form.primary}
          onChange={(primary) => set({ primary })}
          placeholder="#9E2A2B"
          swatch
        />
        <Field
          label="Акцент"
          value={form.accent}
          onChange={(accent) => set({ accent })}
          placeholder="#E39B2F"
          swatch
        />
        <div className="flex items-center md:col-span-2">
          <button type="button" className="btn-primary ml-auto" onClick={() => void save()}>
            Сохранить
          </button>
        </div>
        {note ? <p className="text-sm text-brand-700 md:col-span-2">{note}</p> : null}
      </div>
    </div>
  );
}
