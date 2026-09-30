/**
 * «Торг»: customers who ask for a lower price, per unit. The stall answers yes (at the asked price),
 * no, or its own number — and the customer hears at once, by push and in the app. A yes or a counter
 * is the customer's personal price for a day.
 */
import { Button, radius, scale } from '@bazar/mobile';
import {
  HALL,
  TONE,
  answeredAsks,
  askedOffPercent,
  openAsks,
  parseCounterPrice,
  timeLeftText,
  tr,
} from '@bazar/storefront';
import type { HaggleDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { Bone, LoadError } from '@/components/goods/feedback';
import { Sheet } from '@/components/goods/Sheet';
import { SlipInput } from '@/components/goods/SlipInput';
import { Paper, capital, sceneFont } from '@/components/scene';
import type { useHaggles } from '@/components/stall/use-haggles';

type Haggles = ReturnType<typeof useHaggles>;

const money = (amount: HaggleDto['askedPrice']) => formatMoney(amount.amount, amount.currency);

export function HaggleCard({ haggles }: { haggles: Haggles }) {
  const { rows, failed, answering, notice, reload, answer } = haggles;
  const now = Date.now();
  const open = rows ? openAsks(rows, now) : [];
  const done = rows ? answeredAsks(rows) : [];

  const [counterFor, setCounterFor] = useState<HaggleDto | null>(null);
  const [counter, setCounter] = useState('');
  const [counterError, setCounterError] = useState<string | undefined>();
  // The sheet slides away over a moment: it keeps the ask it was showing until it is gone.
  const last = useRef<HaggleDto | null>(null);
  if (counterFor) last.current = counterFor;
  const view = counterFor ?? last.current;

  // The ask ran out or was answered elsewhere while the sheet was open: nothing left to answer.
  const counterId = counterFor?.id;
  const stillOpen = open.some((row) => row.id === counterId);
  useEffect(() => {
    if (counterId !== undefined && rows && !stillOpen) setCounterFor(null);
  }, [counterId, rows, stillOpen]);

  const openCounter = (row: HaggleDto) => {
    setCounter('');
    setCounterError(undefined);
    setCounterFor(row);
  };

  const sendCounter = async () => {
    if (!counterFor) return;
    const price = parseCounterPrice(counter, counterFor);
    if (!price.ok) {
      setCounterError(price.error);
      return;
    }
    setCounterError(undefined);
    if (await answer(counterFor, { accept: true, price: price.value })) setCounterFor(null);
  };

  return (
    <Paper style={s.card}>
      <View style={s.head}>
        <RNText style={s.label}>Просят скидку</RNText>
        {open.length > 0 ? (
          <View style={s.count} accessible accessibilityLabel={`Ждут ответа: ${open.length}`}>
            <RNText style={s.countText}>{open.length}</RNText>
          </View>
        ) : null}
      </View>

      {rows === null ? (
        failed ? (
          <LoadError text="Не удалось загрузить торг" onRetry={() => void reload()} />
        ) : (
          <Bone style={{ height: 96 }} />
        )
      ) : open.length === 0 ? (
        <RNText style={s.aside}>
          Просьб о скидке сейчас нет. Покупатель называет свою цену за единицу — она придёт сюда и
          уведомлением.
        </RNText>
      ) : (
        <>
          <RNText style={s.explain}>
            «Согласен» — по цене покупателя. Своя цена действует для него сутки.
          </RNText>
          {open.map((row) => (
            <View key={row.id} style={s.ask}>
              <RNText style={s.product}>{tr(row.productName, 'ru')}</RNText>
              <RNText style={s.figures}>
                Просят {money(row.askedPrice)} вместо {money(row.listPrice)} · −
                {askedOffPercent(row.askedPrice.amount, row.listPrice.amount)} %
              </RNText>
              {row.message ? <RNText style={s.quote}>«{row.message}»</RNText> : null}
              <RNText style={s.left}>{timeLeftText(row.expiresAt, now)}</RNText>
              <Button
                label="Согласен"
                disabled={answering !== null}
                onPress={() => void answer(row, { accept: true })}
                accessibilityLabel={`Согласен на ${money(row.askedPrice)}`}
              />
              <View style={s.pair}>
                <Button
                  label="Предложить свою"
                  variant="secondary"
                  style={{ flex: 3 }}
                  disabled={answering !== null}
                  onPress={() => openCounter(row)}
                  accessibilityLabel="Предложить свою цену"
                />
                <Button
                  label="Отказать"
                  variant="secondary"
                  style={{ flex: 2 }}
                  disabled={answering !== null}
                  onPress={() => void answer(row, { accept: false })}
                  accessibilityLabel="Отказать в скидке"
                />
              </View>
            </View>
          ))}
        </>
      )}

      {failed && rows !== null ? (
        <RNText style={s.error}>Не удалось обновить — список может быть старым</RNText>
      ) : null}
      {notice && counterFor === null ? (
        <RNText style={s.error} accessibilityRole="alert">
          {notice}
        </RNText>
      ) : null}

      {done.length > 0 ? (
        <View style={s.done}>
          <RNText style={s.label}>Недавние ответы</RNText>
          {done.map((row) => (
            <View key={row.id} style={s.doneRow}>
              <RNText style={s.doneName} numberOfLines={1}>
                {tr(row.productName, 'ru')}
              </RNText>
              <RNText style={s.doneText}>
                {row.status === 'ACCEPTED' && row.offeredPrice
                  ? `договорились: ${money(row.offeredPrice)}`
                  : 'отказано'}
              </RNText>
            </View>
          ))}
        </View>
      ) : null}

      <Sheet
        visible={counterFor !== null}
        title="Ваша цена"
        onClose={() => setCounterFor(null)}
        busy={answering !== null}
      >
        {view ? (
          <>
            <RNText style={s.sheetLine}>
              {tr(view.productName, 'ru')}: просят {money(view.askedPrice)}, на прилавке{' '}
              {money(view.listPrice)}. Впишите цену между ними.
            </RNText>
            <SlipInput
              label="Цена за единицу"
              suffix="сум"
              value={counter}
              onChangeText={(text) => setCounter(text.replace(/[^\d\s.,]/g, ''))}
              keyboardType="decimal-pad"
              error={counterError}
              editable={answering === null}
            />
            {notice ? (
              <RNText style={s.error} accessibilityRole="alert">
                {notice}
              </RNText>
            ) : null}
            <View style={s.pair}>
              <Button
                label="Отмена"
                variant="secondary"
                style={{ flex: 1 }}
                disabled={answering !== null}
                onPress={() => setCounterFor(null)}
                accessibilityLabel="Закрыть без ответа"
              />
              <Button
                label={answering !== null ? 'Отправляем…' : 'Отправить'}
                style={{ flex: 2 }}
                disabled={answering !== null}
                onPress={() => void sendCounter()}
                accessibilityLabel="Отправить свою цену покупателю"
              />
            </View>
          </>
        ) : null}
      </Sheet>
    </Paper>
  );
}

const s = StyleSheet.create({
  card: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...capital, color: TONE.inkSoft },
  // Counters are ochre, like every badge in the apps; pomegranate is only a button.
  count: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: HALL.ochre,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontFamily: sceneFont.heavy,
    fontSize: scale.caption.fontSize,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  aside: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  explain: { fontFamily: sceneFont.ui, ...scale.body, color: TONE.inkSoft },
  // An ask is a slip that lies flat on the card: the same paper one step lit.
  ask: {
    gap: 6,
    padding: 12,
    borderRadius: radius.paper,
    backgroundColor: TONE.creamLight,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
  },
  product: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  figures: {
    fontFamily: sceneFont.uiHeavy,
    ...scale.body,
    color: HALL.ink,
    fontVariant: ['tabular-nums'],
  },
  quote: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  left: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: TONE.inkSoft,
    marginBottom: 4,
  },
  pair: { flexDirection: 'row', gap: 8 },
  error: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.pomegranate },
  done: { gap: 6, marginTop: 4 },
  doneRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  doneName: { flex: 1, fontFamily: sceneFont.ui, ...scale.body, color: HALL.ink },
  doneText: {
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: TONE.inkSoft,
    fontVariant: ['tabular-nums'],
  },
  sheetLine: { fontFamily: sceneFont.ui, ...scale.body, color: HALL.ink },
});
