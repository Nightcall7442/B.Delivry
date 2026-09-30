/**
 * What the Orders screens say when there is nothing to show: an empty pile, no stall yet, a failed
 * load. A paper slip on the ground with one line said aloud — the way the courier's «Ждём заказы»
 * speaks — and one way out.
 */
import { Button, press, radius, scale, shadow } from '@bazar/mobile';
import { HALL, TONE, type VendorPile } from '@bazar/storefront';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';

import { Paper, sceneFont } from '@/components/scene';

const EMPTY: Record<VendorPile, { title: string; aside: string }> = {
  fresh: {
    title: 'Новых заказов нет',
    aside:
      'Тихо у прилавка. Как только кто-то закажет, телефон завибрирует, а заказ ляжет сюда. Держите приложение открытым.',
  },
  working: {
    title: 'Сейчас ничего не собираете',
    aside: 'Принятые заказы лежат здесь, пока курьер не заберёт их у вас.',
  },
  done: {
    title: 'Пока пусто',
    aside: 'Выданные и отменённые заказы окажутся здесь, как квитанции в конце дня.',
  },
};

export function PileEmpty({ pile }: { pile: VendorPile }) {
  const { title, aside } = EMPTY[pile];
  return (
    <Paper style={s.slip}>
      <RNText style={s.title}>{title}</RNText>
      <RNText style={s.aside}>{aside}</RNText>
    </Paper>
  );
}

/** A signed-in vendor with no stall on their number: nothing to list, and only the desk can fix it. */
export function NoStall({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <Paper style={s.slip}>
      <RNText style={s.title}>За вами не закреплён прилавок</RNText>
      <RNText style={s.aside}>
        Мы пока не привязали к вашему номеру ни одной точки. Напишите в поддержку Bazar Delivery, и
        заказы появятся здесь.
      </RNText>
      <Button
        label={busy ? 'Секунду…' : 'Проверить снова'}
        disabled={busy}
        onPress={onRetry}
        accessibilityRole="button"
        style={s.action}
      />
    </Paper>
  );
}

/** «Could not load · Retry»: the line said aloud, one way to try again. */
export function LoadError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={s.error}>
      <RNText style={s.errorText}>{text}</RNText>
      <Pressable
        onPress={onRetry}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel="Повторить"
        style={({ pressed }) => [s.retry, press.base, pressed && press.down]}
      >
        <RNText style={s.retryText}>Повторить →</RNText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  slip: { gap: 4 },
  title: { fontFamily: sceneFont.display, ...scale.title, color: HALL.ink },
  // An aside from the bazaar, said aloud: Alegreya italic.
  aside: { fontFamily: sceneFont.italic, ...scale.lead, color: TONE.inkSoft },
  action: { marginTop: 12 },
  error: {
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: HALL.cream,
    borderWidth: 1,
    borderColor: TONE.paperEdge,
    borderRadius: radius.paper,
    ...shadow.paper,
  },
  errorText: { flex: 1, fontFamily: sceneFont.italic, ...scale.lead, color: HALL.ink },
  retry: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: HALL.pomegranate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontFamily: sceneFont.display, ...scale.body, color: TONE.creamLight },
});
