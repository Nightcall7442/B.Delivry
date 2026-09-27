/**
 * Order history as a stack of receipts on the hall: one paper slip per order,
 * printed out as it appears, the live ones on top, the vendor's face and the
 * status said as a line. Tap a slip to open the order.
 */
import { isTerminalOrderStatus, ORDER_STATUS } from '@bazar/constants';
import { orderStatusText, tr } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Printed, caps, sceneFont } from '@/components/bazar';
import { Bone, Card, Page, Glyph } from '@/components/ui/Page';
import {
  Button,
  Photo,
  Text,
  color,
  press,
  radius,
  scale,
  shadow,
  useAuth,
  useLocale,
  Receipt,
} from '@bazar/mobile';

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
            <Bone key={i} style={{ height: 120 }} />
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
            const photo = store?.ownerPhotoUrl ?? store?.coverUrl ?? null;
            const person = photo ?? order.store.logoUrl ?? null;
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
              <Printed key={order.id}>
                <Pressable
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
                    {/* A logo stands in only without a photograph, and takes no grade. */}
                    <Photo uri={person} grade={photo !== null} style={s.avatar} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <RNText style={s.vendorName} numberOfLines={1}>
                        {store?.ownerName ?? tr(order.store.name, locale)}
                      </RNText>
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
              </Printed>
            );
          })}
        </View>
      )}
    </Page>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: 'center', padding: 24, paddingVertical: 40, marginTop: 8 },
  // A receipt on the hall: the theme's slip (the type on it is theme-coloured), the one shadow.
  slip: {
    backgroundColor: color.tile,
    borderRadius: radius.paper,
    padding: 14,
    paddingTop: 16,
    gap: 8,
    ...shadow.paper,
  },
  // Done orders sit a little back; the live ones carry the pomegranate status line.
  slipDone: { opacity: 0.92 },
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
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  number: {
    fontFamily: sceneFont.display,
    ...scale.title,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  date: { ...caps, color: color.inkMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  total: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.title,
    color: color.ink,
    fontVariant: ['tabular-nums'],
  },
  vendor: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: color.saffron500,
    backgroundColor: color.field,
  },
  vendorName: { fontFamily: sceneFont.display, ...scale.body, color: color.ink },
  status: { fontFamily: sceneFont.italic, ...scale.lead, color: color.brand500 },
  items: { fontFamily: sceneFont.ui, ...scale.caption, color: color.inkMuted },
});
