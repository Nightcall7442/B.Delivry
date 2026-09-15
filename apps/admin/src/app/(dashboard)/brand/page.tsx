'use client';

import type { TenantDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/** White-label: the name, city and two colours another city's bazaar app runs under. */
export default function BrandPage() {
  const [tenant, setTenant] = useState<TenantDto | null>(null);
  const [form, setForm] = useState({
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
          primary: row.branding?.primary ?? '#3B6BE3',
          accent: row.branding?.accent ?? '#F5A524',
        });
      })
      .catch(() => undefined);
  }, []);

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
      setNote('Не сохранилось: цвета — hex вида #3B6BE3, ссылка на логотип — полный URL');
    }
  };
  const Field = ({
    label,
    k,
    placeholder,
  }: {
    label: string;
    k: keyof typeof form;
    placeholder?: string;
  }) => (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-ink-muted">{label}</span>
      <input
        className="field mt-1 w-full"
        value={form[k]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">Бренд</h1>
      <p className="mt-1 text-sm text-ink-muted">
        White-label: домен арендатора ({tenant?.domain ?? 'не задан'}) открывает тот же сайт под
        своим именем и цветами. Мобильные приложения берут имя и город отсюда, цвета — при сборке.
      </p>
      <div className="card mt-4 grid max-w-2xl gap-3 p-4 md:grid-cols-2">
        <Field label="Название арендатора" k="name" />
        <Field label="Имя приложения (вордмарк)" k="appName" placeholder="bazar" />
        <Field label="Город" k="city" placeholder="Самарканд" />
        <Field label="Логотип (URL)" k="logoUrl" placeholder="https://…/logo.png" />
        <Field label="Основной цвет" k="primary" placeholder="#3B6BE3" />
        <Field label="Акцент" k="accent" placeholder="#F5A524" />
        <div className="flex items-center gap-3 md:col-span-2">
          <span
            className="h-8 w-8 rounded-full border border-line"
            style={{ background: form.primary }}
          />
          <span
            className="h-8 w-8 rounded-full border border-line"
            style={{ background: form.accent }}
          />
          <button type="button" className="btn-primary ml-auto" onClick={() => void save()}>
            Сохранить
          </button>
        </div>
        {note ? <p className="text-sm text-brand-700 md:col-span-2">{note}</p> : null}
      </div>
    </div>
  );
}
