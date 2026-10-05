/**
 * «Свой продавец» on a stall's page: the customer is known here — how many times they bought, since
 * when — and one tap puts the last order back in the basket, the wishes beside the lines, straight
 * to checkout. Shown only to someone who has bought here before.
 */
import { repeatNotes, repeatQuantities } from '@bazar/storefront';
import type { MyStallDto } from '@bazar/types';
import { Heart, api, radius, scale, useAuth, useLocale } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Glass, scene, sceneFont } from '@/components/bazar';
import { useCart, useCartNotes } from '@/features/cart/store';

export function RegularCard({ storeId, seller }: { storeId: string; seller: string }) {
  const router = useRouter();
  const { t } = useLocale();
  const { user } = useAuth();
  const { quantities, replace } = useCart();
  const { setNote } = useCartNotes();
  const [mine, setMine] = useState<MyStallDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api()
      .regulars.mine(storeId)
      .then((value) => alive && setMine(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [storeId, user]);

  if (!user || mine === null || mine.orders === 0 || mine.lastOrderId === null) return null;
  const lastOrderId = mine.lastOrderId;

  const again = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const order = await api().orders.get(lastOrderId);
      replace(repeatQuantities(order.items, quantities));
      for (const [productId, wish] of Object.entries(repeatNotes(order.items))) {
        setNote(productId, wish);
      }
      router.push({ pathname: '/checkout', params: { store: storeId } });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Heart size={16} color={scene.ochreLight} fill={scene.ochreLight} />
        <Text style={s.title}>{t('regular.title')}</Text>
        <Text style={s.seller} numberOfLines={1}>
          · {seller}
        </Text>
      </View>
      <Text style={s.line}>
        {t.n('regular.times', mine.orders)}
        {mine.since ? ` ${t('regular.since', { date: t.date(mine.since) })}` : ''}
      </Text>
      <Glass
        style={s.button}
        onPress={() => {
          if (!busy) void again();
        }}
      >
        <Text style={s.buttonText}>{t('regular.again')} →</Text>
        <Text style={s.buttonHint}>{t('regular.againHint')}</Text>
      </Glass>
      {failed ? (
        <Text style={s.error} accessibilityRole="alert">
          {t('regular.failed')}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 14,
    padding: 14,
    gap: 8,
    borderRadius: radius.paper,
    borderWidth: 1,
    borderColor: scene.ochre,
    backgroundColor: scene.glass,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: scene.ochreLight },
  seller: { flex: 1, fontFamily: sceneFont.uiText, ...scale.body, color: scene.creamMuted },
  line: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.paper, gap: 2 },
  buttonText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: scene.cream },
  buttonHint: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted },
  error: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.ochreLight },
});
