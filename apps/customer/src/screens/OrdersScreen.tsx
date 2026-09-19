/**
 * Order history as a stack of receipts: one paper slip per order, the live
 * ones on top with a saffron pin, the vendor's face and the status in their
 * handwriting. Tap a slip to open the order.
 */
import { isTerminalOrderStatus, ORDER_STATUS } from '@bazar/constants';
import { orderStatusText, tr } from '@bazar/storefront';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { sceneFont } from '@/components/bazar';
import { Bone, Card, Page, Glyph } from '@/components/ui/Page';
import { Button, Text, color, press, useAuth, useLocale, Receipt } from '@bazar/mobile';

import { useOrderList } from '@/features/orders/store';
import { listStores } from '@/lib/catalog';
import { useList } from '@/lib/use-data';

export function OrdersScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user, ready: authReady } = useAuth();
  const { orders, ready, reload } = useOrderList();
  const stores = useList(() => listStores(), []);
  const storeOf = (id: string) => stores.find((store) => store.id === id) ?? null;
  const sorted = [...orders].sort(
    (a, b) => Number(isTerminalOrderStatus(a.status)) - Number(isTerminalOrderStatus(b.status)),
  );

  return (
    <Page tabs title={t('orders.title')} cart onRefresh={() => Promise.resolve(reload())}>
      {!authReady || !ready ? (
        <View style={{ gap: 14, marginTop: 6 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Bone key={i} style={{ height: 120, borderRadius: 6 }} />
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
            label={t('scene.walkRow')}
            style={{ marginTop: 24, alignSelf: 'stretch' }}
            onPress={() => router.replace('/')}
          />
        </Card>
      ) : (
        <View style={{ gap: 16, marginTop: 8, paddingBottom: 8 }}>
          {sorted.map((order, i) => {
            const { status } = order;
            const done = isTerminalOrderStatus(status);
            const failed = status === ORDER_STATUS.CANCELLED || status === ORDER_STATUS.FAILED;
            const store = storeOf(order.store.id);
            const person = store?.ownerPhotoUrl ?? store?.coverUrl ?? order.store.logoUrl ?? null;
            const when = new Date(order.placedAt).toLocaleString(
              locale === 'uz' ? 'uz-Latn-UZ' : 'ru-RU',
              {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Tashkent',
              },
            );
            const statusText = orderStatusText(locale)[status];
            return (
              <Pressable
                key={order.id}
                onPress={() =>
                  router.push({ pathname: '/order/[orderId]', params: { orderId: order.id } })
                }
                style={({ pressed }) => [
                  s.slip,
                  { transform: [{ rotate: `${i % 2 === 0 ? -0.5 : 0.5}deg` }] },
                  done && s.slipDone,
                  press.base,
                  pressed && press.down,
                ]}
              >
                <View style={s.perforation} />
                {!done ? <View style={s.pin} /> : null}
                <View style={s.head}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <RNText style={s.number}>№ {order.number.replace(/^BZ-\d+-/, '')}</RNText>
                    <RNText style={s.date}>{when.toUpperCase()}</RNText>
                  </View>
                  <RNText style={[s.total, done && { color: color.inkMuted }]}>
                    {t.money(order.totals.total.amount)}
                  </RNText>
                </View>

                <View style={s.vendor}>
                  {person ? (
                    <Image
                      source={{ uri: person }}
                      style={s.avatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={s.avatar} />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text role="body" numberOfLines={1} style={{ fontWeight: '700', fontSize: 14 }}>
                      {store?.ownerName ?? tr(order.store.name, locale)}
                    </Text>
                    <Text role="caption" numberOfLines={1}>
                      {store?.ownerName ? tr(order.store.name, locale) : ''}
                      {store?.standNumber ? ` · ${store.standNumber}` : ''}
                    </Text>
                  </View>
                </View>

                <RNText
                  style={[
                    s.status,
                    done && { color: color.inkMuted },
                    failed && { color: color.danger },
                  ]}
                  numberOfLines={2}
                >
                  {done
                    ? statusText.title
                    : `${statusText.title} — ${statusText.hint.charAt(0).toLowerCase()}${statusText.hint.slice(1)}`}
                </RNText>
                <RNText style={s.items}>
                  {t.n('cart.items', order.items.length)}
                  {done && !failed ? ` · ${t('orders.reorderHint')}` : ''}
                </RNText>
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
  slip: {
    backgroundColor: color.tile,
    borderRadius: 6,
    padding: 14,
    paddingTop: 16,
    gap: 8,
    shadowColor: '#3A2A1A',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  slipDone: { shadowOpacity: 0.14, opacity: 0.92 },
  perforation: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -1,
    height: 3,
    borderStyle: 'dashed',
    borderTopWidth: 3,
    borderColor: color.ink,
    opacity: 0.25,
  },
  pin: {
    position: 'absolute',
    top: -6,
    left: '50%',
    marginLeft: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.saffron500,
    borderWidth: 1.5,
    borderColor: color.saffron600,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  number: { fontFamily: sceneFont.display, fontSize: 20, color: color.ink },
  date: {
    fontFamily: sceneFont.uiHeavy,
    fontSize: 10,
    letterSpacing: 1,
    color: color.inkMuted,
    marginTop: 2,
  },
  total: { fontFamily: sceneFont.hand, fontSize: 26, lineHeight: 28, color: color.ink },
  vendor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: color.saffron500,
    backgroundColor: color.field,
  },
  status: { fontFamily: sceneFont.hand, fontSize: 21, lineHeight: 22, color: color.brand500 },
  items: { fontFamily: sceneFont.ui, fontSize: 11, color: color.inkMuted },
});
