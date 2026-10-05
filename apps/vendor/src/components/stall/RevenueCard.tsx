/**
 * What the stall sold: today, then the last seven days — laid out like the courier's ledger, the
 * day's figure big, the week under the tear line. The footnote says what is counted, because the
 * number is the customers' cheques and not the stall's own takings.
 */
import { GUARANTEE, type Currency } from '@bazar/constants';
import { scale } from '@bazar/mobile';
import { HALL, TONE, plural } from '@bazar/storefront';
import { formatMoney } from '@bazar/utils/money';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Bone, LoadError } from '@/components/goods/feedback';
import { Paper, capital, sceneFont } from '@/components/scene';
import type { Revenue, Tally } from '@/components/stall/use-revenue';
import type { VendorPayoutDto } from '@bazar/types';

const delivered = (count: number) =>
  `Доставлено: ${count} ${plural(count, 'заказ', 'заказа', 'заказов')}`;

export function RevenueCard({
  revenue,
  failed,
  onRetry,
}: {
  revenue: Revenue | null;
  failed: boolean;
  onRetry: () => void;
}) {
  if (revenue === null) {
    return failed ? (
      <LoadError text="Не удалось посчитать выручку" onRetry={onRetry} />
    ) : (
      <View accessible accessibilityLabel="Загрузка" style={s.bones}>
        <Bone style={{ height: 96 }} />
        <Bone style={{ height: 40 }} />
      </View>
    );
  }
  return (
    <Paper style={s.card}>
      <RNText style={s.label}>Сегодня</RNText>
      <RNText style={s.money}>{sum(revenue.today)}</RNText>
      <RNText style={s.muted}>{delivered(revenue.today.orders)}</RNText>
      <View style={s.rule} />
      <View style={s.line}>
        <View style={{ flex: 1 }}>
          <RNText style={s.lineLabel}>7 дней</RNText>
          <RNText style={s.muted}>{delivered(revenue.week.orders)}</RNText>
        </View>
        <RNText style={s.lineMoney}>{sum(revenue.week)}</RNText>
      </View>
      {revenue.payout ? <Payout payout={revenue.payout} /> : null}
      {failed ? (
        <RNText style={s.stale}>Не удалось обновить — цифры могут быть старыми</RNText>
      ) : null}
      <RNText style={s.note}>
        Считаем доставленные заказы, оформленные за эти дни (день — по Ташкенту, с полуночи). Сумма
        — весь чек покупателя: товары, доставка и сервисный сбор за вычетом скидок.
      </RNText>
    </Paper>
  );
}

const sum = ({ revenue, currency }: Tally) => formatMoney(revenue, currency);

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });

/**
 * What the platform owes, after commission: available now, and on hold while customers may still
 * complain — two hours after delivery, or until an open complaint is settled.
 */
function Payout({ payout }: { payout: VendorPayoutDto }) {
  return (
    <>
      <View style={s.rule} />
      <View style={s.line}>
        <View style={{ flex: 1 }}>
          <RNText style={s.lineLabel}>К выплате</RNText>
          <RNText style={s.muted}>{delivered(payout.orderCount)}</RNText>
        </View>
        <RNText style={s.lineMoney}>
          {formatMoney(payout.available, payout.currency as Currency)}
        </RNText>
      </View>
      {payout.onHold > 0 ? (
        <RNText style={s.muted}>
          Ещё {formatMoney(payout.onHold, payout.currency as Currency)} на удержании (
          {payout.onHoldOrders} {plural(payout.onHoldOrders, 'заказ', 'заказа', 'заказов')})
          {payout.releasesAt ? ` — первые освободятся в ${clock(payout.releasesAt)}` : ''}
        </RNText>
      ) : null}
      <RNText style={s.note}>
        Деньги за заказ доступны через {GUARANTEE.FRESHNESS_WINDOW_HOURS} часа после доставки, если
        покупатель не пожаловался на свежесть — так покупатель уверен, а вы получаете за честный
        товар. Сумма — товары за вычетом комиссии.
      </RNText>
    </>
  );
}

const s = StyleSheet.create({
  bones: { gap: 8 },
  card: { gap: 2 },
  label: { ...capital, color: TONE.inkSoft },
  money: {
    fontFamily: sceneFont.heavy,
    ...scale.headline,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  muted: {
    fontFamily: sceneFont.ui,
    ...scale.body,
    color: TONE.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  // The tear line of a receipt between today and the running sums.
  rule: {
    marginVertical: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: TONE.paperEdge,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineLabel: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: HALL.ink },
  lineMoney: {
    fontFamily: sceneFont.heavy,
    ...scale.lead,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  stale: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate, marginTop: 8 },
  note: { fontFamily: sceneFont.italic, ...scale.body, color: TONE.inkSoft, marginTop: 12 },
});
