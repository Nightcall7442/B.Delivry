/**
 * What a delivered order asks for, once: stars for the courier and the stall,
 * a line and a photo if there is something to say, and a tip for the courier.
 */
import { isApiError } from '@bazar/api-client';
import { Button, Chip, Field, Panel, Text, api, color, useLocale } from '@bazar/mobile';
import { ONLINE_PROVIDERS } from '@bazar/storefront';
import type { OrderDto, PaymentDto, ReviewDto } from '@bazar/types';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

const TIPS = [200_000, 500_000, 1_000_000];

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} hitSlop={4}>
          <Text style={{ fontSize: 26, color: n <= value ? color.saffron500 : color.sand300 }}>
            ★
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AfterDelivery({ order }: { order: OrderDto }) {
  const { t } = useLocale();
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

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    try {
      const blob = await fetch(asset.uri).then((r) => r.blob());
      const uploaded = await api().uploads.image(
        'reviews',
        blob,
        asset.mimeType ?? blob.type ?? 'image/jpeg',
      );
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
      let payment: PaymentDto;
      try {
        payment = await api().payments.create({ subject, method: 'BALANCE' });
      } catch {
        payment = await api().payments.create({
          subject,
          method: 'ONLINE',
          provider: ONLINE_PROVIDERS[0].id,
          returnUrl: `bazar-customer://order/${order.id}`,
        });
        if (payment.confirmationUrl)
          await Linking.openURL(payment.confirmationUrl).catch(() => undefined);
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
    <Panel style={{ marginTop: 12, padding: 12, gap: 10 }}>
      {done ? (
        <Text role="muted">{t('review.thanks')}</Text>
      ) : (
        <>
          {order.courierId && !reviewed('COURIER') ? (
            <View style={{ gap: 4 }}>
              <Text role="caption">{t('review.courier')}</Text>
              <Stars value={courierStars} onChange={setCourierStars} />
            </View>
          ) : null}
          {!reviewed('STORE') ? (
            <View style={{ gap: 4 }}>
              <Text role="caption">{t('review.store')}</Text>
              <Stars value={storeStars} onChange={setStoreStars} />
            </View>
          ) : null}
          <Field
            value={comment}
            onChangeText={setComment}
            placeholder={t('review.comment')}
            style={{ height: 44 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip
              label={photoUrl ? '✓ ' + t('review.photo') : '+ ' + t('review.photo')}
              active={!!photoUrl}
              onPress={() => void pickPhoto()}
            />
            <Button
              label={t('review.send')}
              disabled={busy || (courierStars === 0 && storeStars === 0)}
              style={{ flex: 1, height: 40 }}
              onPress={() => void send()}
            />
          </View>
        </>
      )}
      {order.courierId ? (
        <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: color.line, paddingTop: 10 }}>
          <Text role="caption">{t('tip.title')}</Text>
          {tipped ? (
            <Text role="muted">{t('tip.sent', { amount: t.money(tipped.amount.amount) })}</Text>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {TIPS.map((amount) => (
                  <Chip key={amount} label={t.money(amount)} onPress={() => void tip(amount)} />
                ))}
              </View>
              <Text role="caption">{t('tip.hint')}</Text>
            </>
          )}
        </View>
      ) : null}
      {note ? (
        <Text role="caption" style={{ color: color.danger }}>
          {note}
        </Text>
      ) : null}
    </Panel>
  );
}
