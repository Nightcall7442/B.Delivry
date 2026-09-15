/**
 * What a delivered order asks for, once: stars for the courier and the stall,
 * a line and a photo if there is something to say, and a tip for the courier.
 */
'use client';

import { isApiError } from '@bazar/api-client';
import { createT } from '@bazar/i18n';
import { ONLINE_PROVIDERS } from '@bazar/storefront';
import type { OrderDto, PaymentDto, ReviewDto } from '@bazar/types';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

const TIPS = [200_000, 500_000, 1_000_000];

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-2xl leading-none ${n <= value ? 'text-saffron-500' : 'text-sand-300'}`}
          aria-label={`${n}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function AfterDelivery({ order, locale }: { order: OrderDto; locale: string }) {
  const t = createT(locale);
  const [reviews, setReviews] = useState<ReviewDto[] | null>(null);
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [courierStars, setCourierStars] = useState(0);
  const [storeStars, setStoreStars] = useState(0);
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    api()
      .reviews.forOrder(order.id)
      .then(setReviews)
      .catch(() => setReviews([]));
    api()
      .payments.forOrder(order.id)
      .then(setPayments)
      .catch(() => undefined);
  }, [order.id]);

  const reviewed = (target: 'COURIER' | 'STORE') =>
    reviews?.some((r) => r.target === target) ?? false;
  const tipped = payments.find((p) => p.purpose === 'TIP' && p.status === 'CAPTURED');

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      const uploaded = await api().uploads.image('reviews', file, file.type || 'image/jpeg');
      setPhotoUrl(uploaded.url);
    } catch {
      setNote(t('common.error'));
    }
  };

  const send = async () => {
    setBusy(true);
    setNote(null);
    try {
      if (courierStars > 0 && order.courierId && !reviewed('COURIER')) {
        await api().reviews.create({
          orderId: order.id,
          target: 'COURIER',
          targetId: order.courierId,
          rating: courierStars,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
          ...(photoUrl ? { photoUrls: [photoUrl] } : {}),
        });
      }
      if (storeStars > 0 && !reviewed('STORE')) {
        await api().reviews.create({
          orderId: order.id,
          target: 'STORE',
          targetId: order.storeId,
          rating: storeStars,
          ...(comment.trim() && (!order.courierId || reviewed('COURIER'))
            ? { comment: comment.trim() }
            : {}),
        });
      }
      setReviews(await api().reviews.forOrder(order.id));
    } catch (cause) {
      setNote(isApiError(cause) ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const tip = async (amount: number) => {
    setBusy(true);
    setNote(null);
    const subject = `tip:${order.id}:${amount}`;
    try {
      try {
        await api().payments.create({ subject, method: 'BALANCE' });
      } catch {
        const payment = await api().payments.create({
          subject,
          method: 'ONLINE',
          provider: ONLINE_PROVIDERS[0].id,
          returnUrl: window.location.href,
        });
        if (payment.confirmationUrl) {
          window.location.assign(payment.confirmationUrl);
          return;
        }
      }
      setPayments(await api().payments.forOrder(order.id));
    } catch (cause) {
      setNote(isApiError(cause) ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (reviews === null) return null;
  const done = (!order.courierId || reviewed('COURIER')) && reviewed('STORE');

  return (
    <section className="mt-3 flex flex-col gap-3 rounded-2xl bg-sand-50 p-3 text-sm">
      {done ? (
        <p className="text-ink-muted">{t('review.thanks')}</p>
      ) : (
        <>
          {order.courierId && !reviewed('COURIER') ? (
            <div>
              <p className="text-xs text-ink-muted">{t('review.courier')}</p>
              <Stars value={courierStars} onChange={setCourierStars} />
            </div>
          ) : null}
          {!reviewed('STORE') ? (
            <div>
              <p className="text-xs text-ink-muted">{t('review.store')}</p>
              <Stars value={storeStars} onChange={setStoreStars} />
            </div>
          ) : null}
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="go-field h-11"
            placeholder={t('review.comment')}
          />
          <div className="flex gap-2">
            <label className="go-chip h-10 cursor-pointer">
              {photoUrl ? '✓ ' : '+ '}
              {t('review.photo')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              className="btn-go h-10 flex-1"
              disabled={busy || (courierStars === 0 && storeStars === 0)}
              onClick={() => void send()}
            >
              {t('review.send')}
            </button>
          </div>
        </>
      )}
      {order.courierId ? (
        <div className="border-t border-line pt-3">
          <p className="text-xs text-ink-muted">{t('tip.title')}</p>
          {tipped ? (
            <p className="mt-1 text-ink-muted">
              {t('tip.sent', { amount: t.money(tipped.amount.amount) })}
            </p>
          ) : (
            <>
              <div className="mt-1.5 flex gap-2">
                {TIPS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="go-chip h-9"
                    disabled={busy}
                    onClick={() => void tip(amount)}
                  >
                    {t.money(amount)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">{t('tip.hint')}</p>
            </>
          )}
        </div>
      ) : null}
      {note ? <p className="text-xs text-danger">{note}</p> : null}
    </section>
  );
}
