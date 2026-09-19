/**
 * A shopping list in words — typed, dictated or photographed — becomes a
 * basket. Parsing runs on every keystroke, so the customer watches the list
 * turn into stall products and fixes the odd word before adding it all.
 */
'use client';

import { Camera, Mic } from '@/components/go/icons';
import { createT } from '@bazar/i18n';
import { canDictate, dictate, parseShoppingList, tr, unitLabel } from '@bazar/storefront';
import type { ProductDto } from '@bazar/types';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { useCartActions, useCartQuantities } from '@/features/cart';
import { api } from '@/lib/api';

export function ListScreen({ products, locale }: { products: ProductDto[]; locale: string }) {
  const t = createT(locale);
  const router = useRouter();
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const units = unitLabel(locale);

  const [text, setText] = useState('');
  // Line index → product id the customer picked among the alternatives.
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [mic, setMic] = useState(false);
  const session = useRef<{ stop(): void } | null>(null);
  useEffect(() => {
    setMic(canDictate());
    return () => session.current?.stop();
  }, []);

  const lines = useMemo(() => parseShoppingList(text, products), [text, products]);
  const resolved = lines.map((line, index) => {
    const picked = picks[index];
    const product = picked ? (products.find((p) => p.id === picked) ?? line.product) : line.product;
    return { ...line, product };
  });
  const matched = resolved.filter((line) => line.product !== null);

  const toggleDictation = () => {
    if (session.current) {
      session.current.stop();
      return;
    }
    const spoken = text;
    session.current = dictate(
      locale,
      (heard) => setText(spoken ? `${spoken}, ${heard}` : heard),
      () => {
        session.current = null;
        setListening(false);
      },
    );
    setListening(session.current !== null);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setNote(null);
    try {
      const { text: read } = await api().uploads.recognize(file, file.type || 'image/jpeg');
      setText((current) => (current.trim() ? `${current.trim()}\n${read}` : read));
    } catch {
      setNote(t('common.error'));
    } finally {
      setReading(false);
    }
  };

  const addAll = () => {
    // Demand analytics: what the bazaar could not offer today is what to bring tomorrow.
    for (const line of resolved) {
      if (line.product === null) {
        void api()
          .analytics.recordDemand({ query: line.raw, results: 0, source: 'list' })
          .catch(() => undefined);
      }
    }
    for (const line of matched) {
      const product = line.product!;
      const step = product.quantityStep || 1;
      const wanted = Math.max(product.minQuantity, Math.round(line.quantity / step) * step);
      setQuantity(product.id, (quantities[product.id] ?? 0) + wanted);
    }
    setNote(t('list.added'));
    router.push(`/${locale}/cart`);
  };

  return (
    <GoShell
      locale={locale}
      back="history"
      expanded
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('list.title')}</h1>
      }
    >
      <p className="mt-1 text-sm text-ink-muted">{t('list.intro')}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        autoFocus
        className="go-field mt-3 h-auto resize-none py-3"
        placeholder={t('list.placeholder')}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {mic ? (
          <button
            type="button"
            className="go-chip"
            aria-pressed={listening}
            onClick={toggleDictation}
          >
            <Mic size={16} />
            {listening ? t('list.stop') : t('list.dictate')}
          </button>
        ) : null}
        <label className="go-chip cursor-pointer">
          <Camera size={16} />
          {reading ? t('list.recognizing') : t('list.photo')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={reading}
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        {listening ? t('list.listening') : mic ? t('list.ocrHint') : t('list.noMic')}
      </p>
      {note ? <p className="mt-1.5 text-xs font-medium text-brand-700">{note}</p> : null}

      {resolved.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {resolved.map((line, index) => (
            <div key={`${index}-${line.raw}`} className="rounded-2xl bg-sand-50 p-3">
              <p className="text-xs text-ink-muted">{line.raw}</p>
              {line.product ? (
                <p className="font-display text-sm font-bold">
                  {tr(line.product.name, locale)} · {line.quantity} {units[line.product.unit]} ·{' '}
                  {t.money(line.product.price.amount * line.quantity)}
                </p>
              ) : (
                <p className="text-sm text-danger">{t('list.notFound')}</p>
              )}
              {line.alternatives.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-3">
                  {line.alternatives.map((alt) => (
                    <button
                      key={alt.id}
                      type="button"
                      className="text-xs font-medium text-brand-700"
                      onClick={() => setPicks((current) => ({ ...current, [index]: alt.id }))}
                    >
                      {tr(alt.name, locale)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="btn-go mt-1"
            disabled={matched.length === 0}
            onClick={addAll}
          >
            {t('list.addAll')} · {t.n('cart.items', matched.length)}
          </button>
        </div>
      ) : null}
    </GoShell>
  );
}
