/** Order history: one white card per order, live ones first with a green status pill. */
import { isTerminalOrderStatus } from '@bazar/constants';
import { orderStatusText, tr } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Bone, Card, Page, ui, Glyph } from '@/components/ui/Page';
import {
  Basket,
  Button,
  Chevron,
  Photo,
  Text,
  color,
  press,
  useAuth,
  useLocale,
  Receipt,
} from '@bazar/mobile';

import { useOrderList } from '@/features/orders/store';
import { listStores } from '@/lib/catalog';
import { useData } from '@/lib/use-data';

export function OrdersScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user, ready: authReady } = useAuth();
  const { orders, ready, reload } = useOrderList();
  const stores = useData(() => listStores(), []) ?? [];
  const coverOf = (id: string) => stores.find((store) => store.id === id)?.coverUrl ?? null;

  return (
    <Page tabs title={t('orders.title')} cart onRefresh={() => Promise.resolve(reload())}>
      {!authReady || !ready ? (
        <View style={{ gap: 10, marginTop: 6 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <Bone key={i} style={{ height: 80 }} />
          ))}
        </View>
      ) : !user ? (
        <Card style={s.empty}>
          <Text role="title">{t('orders.signIn')}</Text>
          <Button
            label={t('common.signIn')}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
            onPress={() => router.push({ pathname: '/login', params: { next: '/orders' } })}
          />
        </Card>
      ) : orders.length === 0 ? (
        <Card style={s.empty}>
          <Glyph icon={Receipt} size={72} />
          <Text role="title" style={{ marginTop: 12 }}>
            {t('orders.empty')}
          </Text>
          <Button
            label={t('common.toStores')}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
            onPress={() => router.replace('/')}
          />
        </Card>
      ) : (
        <View style={{ gap: 10, marginTop: 6 }}>
          {orders.map((order) => {
            const { status } = order;
            const done = isTerminalOrderStatus(status);
            const when = new Date(order.placedAt).toLocaleString('ru-RU', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <Pressable
                key={order.id}
                onPress={() =>
                  router.push({ pathname: '/order/[orderId]', params: { orderId: order.id } })
                }
                style={({ pressed }) => [s.row, press.base, pressed && press.down]}
              >
                <Photo
                  uri={order.store.logoUrl ?? coverOf(order.store.id)}
                  style={s.thumb}
                  fallback={<Basket size={24} color={ui.brandDeep} />}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text role="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                    {tr(order.store.name, locale)}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.pill, done ? s.pillDone : s.pillLive]}>
                      <Text
                        role="caption"
                        numberOfLines={1}
                        style={{ color: done ? color.inkMuted : ui.brandDeep, fontWeight: '600' }}
                      >
                        {orderStatusText(locale)[status].title}
                      </Text>
                    </View>
                  </View>
                  <Text role="caption">
                    {t.money(order.totals.total.amount)} · {when}
                  </Text>
                </View>
                <Chevron size={20} color={color.inkFaint} />
              </Pressable>
            );
          })}
        </View>
      )}
    </Page>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', padding: 24, paddingVertical: 40, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: color.tile,
    borderRadius: 20,
    padding: 10,
    paddingRight: 14,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: ui.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
  pillLive: { backgroundColor: ui.brandSoft },
  pillDone: { backgroundColor: color.sand100 },
});
