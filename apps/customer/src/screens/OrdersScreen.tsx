/**
 * Order history as a stack of receipts on the hall: one paper slip per order,
 * printed out as it appears, the vendor's face and the status said as a line.
 * Three chips sort the stack — live, delivered, cancelled — newest on top. Tap
 * a slip to open the order.
 */
import type { MessageKey } from '@bazar/i18n';
import {
  ORDER_SEGMENTS,
  orderStatusText,
  pickSegment,
  shownSegment,
  splitOrders,
  tr,
  type OrderSegment,
  type SegmentPick,
} from '@bazar/storefront';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';

import { Printed, caps, sceneFont } from '@/components/bazar';
import { Bone, Card, Page, Glyph } from '@/components/ui/Page';
import {
  Button,
  Chip,
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

const EMPTY: Record<OrderSegment, MessageKey> = {
  active: 'orders.emptyActive',
  delivered: 'orders.emptyDelivered',
  cancelled: 'orders.emptyCancelled',
};

export function OrdersScreen() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user, ready: authReady } = useAuth();
  const { orders, ready, reload } = useOrderList({ history: true });
  // The tab stays mounted while another is open: come back to fresh statuses, a live order that
  // was just delivered belongs under «Доставленные», not under «Активные».
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (seen.current) void reload();
      seen.current = true;
    }, [reload]),
  );
  const stores = useList(() => listStores(), []);
  const storeOf = (id: string) => stores.find((store) => store.id === id) ?? null;
  const split = useMemo(() => splitOrders(orders), [orders]);
  const [pick, setPick] = useState<SegmentPick | null>(null);
  const segment = shownSegment(pick, split);
  const shown = split[segment];
  const thisYear = new Date().getFullYear();

  return (
    <Page tabs title={t('orders.title')} cart onRefresh={reload}>
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.segments}
            contentContainerStyle={s.segmentsRow}
          >
            {ORDER_SEGMENTS.map((name) => (
              <Chip
                key={name}
                label={`${t(`orders.segment.${name}`)} · ${split[name].length}`}
                active={name === segment}
                onPress={() => setPick(pickSegment(name, split))}
              />
            ))}
          </ScrollView>

          {shown.length === 0 ? (
            <Card style={[s.empty, { marginTop: 0 }]}>
              <Glyph icon={Receipt} size={72} />
              <Text role="title" style={{ marginTop: 12, textAlign: 'center' }}>
                {t(EMPTY[segment])}
              </Text>
              {segment === 'active' ? (
                <Button
                  label={t('scene.walkRow')}
                  style={{ marginTop: 24, alignSelf: 'stretch' }}
                  onPress={() => router.replace('/')}
                />
              ) : null}
            </Card>
          ) : null}
          {shown.map((order, i) => {
            const { status } = order;
            const done = segment !== 'active';
            const failed = segment === 'cancelled';
            const store = storeOf(order.store.id);
            const photo = store?.ownerPhotoUrl ?? store?.coverUrl ?? null;
            const person = photo ?? order.store.logoUrl ?? null;
            const placed = new Date(order.placedAt);
            // The history reaches back past New Year: an old slip says which year it is from.
            const when = t.when(placed, { year: placed.getFullYear() !== thisYear, time: true });
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
  // The chips run to the screen's edges, so a narrow phone can slide to the third one.
  segments: { marginHorizontal: -16, flexGrow: 0 },
  segmentsRow: { gap: 8, paddingHorizontal: 16 },
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
