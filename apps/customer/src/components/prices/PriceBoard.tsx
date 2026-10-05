/**
 * «Индекс базара» on the home: the price board at a bazaar's gate — the first staples in chalk,
 * how the rows stand against the shops and how the week went. The whole board opens the index.
 */
import { HALL, alpha, changeText, sparkPath, tr, trendOf } from '@bazar/storefront';
import type { PriceIndexDto } from '@bazar/types';
import { radius, scale, shadow, useLocale } from '@bazar/mobile';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { scene, sceneFont } from '@/components/bazar';

/** The board's verdict line: «В рядах дешевле на 13 % · за неделю +3,3 %». */
export function useIndexLine(index: PriceIndexDto): string {
  const { t } = useLocale();
  const cheaper = index.cheaperThanShopsPercent;
  const parts = [
    cheaper !== null
      ? t(cheaper >= 0 ? 'prices.cheaper' : 'prices.dearer', { percent: Math.abs(cheaper) })
      : null,
    index.weekChangePercent !== null
      ? `${t('prices.week').toLowerCase()} ${changeText(t, index.weekChangePercent)}`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : t('prices.teaserLine');
}

export function PriceBoard({ index, onPress }: { index: PriceIndexDto; onPress: () => void }) {
  const { locale, t } = useLocale();
  const line = useIndexLine(index);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${t('prices.teaser')}. ${line}`}
      style={({ pressed }) => [s.board, pressed && { opacity: 0.9 }]}
    >
      <View style={s.head}>
        <Text style={s.title}>{t('prices.teaser')}</Text>
        <Text style={s.more}>→</Text>
      </View>
      <Text style={s.line}>{line}</Text>
      <View style={s.rows}>
        {index.items.slice(0, 6).map((item) => {
          const trend = trendOf(item.changePercent);
          return (
            <View key={item.key} style={s.cell}>
              <Text style={s.name} numberOfLines={1}>
                {tr(item.title, locale)}
              </Text>
              <Text style={s.price}>
                {t.money(item.median, index.currency)}
                {trend !== 'flat' ? (
                  <Text style={trend === 'up' ? s.up : s.down}>{trend === 'up' ? ' ▲' : ' ▼'}</Text>
                ) : null}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

/** The eight weeks of an item as a thin line; nothing when fewer than two weeks are known. */
export function Spark({
  weeks,
  color,
  width = 48,
  height = 22,
}: {
  weeks: (number | null)[];
  color: string;
  width?: number;
  height?: number;
}) {
  const path = sparkPath(weeks, width, height, 3);
  if (path === null) return <View style={{ width }} />;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={path} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  board: {
    marginHorizontal: 20,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: radius.paper,
    backgroundColor: scene.board,
    borderWidth: 1,
    borderColor: alpha(HALL.ochre, 0.35),
    ...shadow.paper,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: sceneFont.display, ...scale.lead, color: scene.ochreLight },
  more: { fontFamily: sceneFont.ui, ...scale.lead, color: scene.ochreLight },
  line: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.creamMuted, marginTop: 2 },
  rows: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: alpha(scene.cream, 0.22),
  },
  cell: { width: '33.33%', paddingRight: 8 },
  name: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted },
  // A step down from 21: «12 000 soʻm» is a word longer than «сум» and was cut in a third of a row.
  price: { fontFamily: sceneFont.hand, fontSize: 19, lineHeight: 22, color: scene.cream },
  up: { fontFamily: sceneFont.ui, fontSize: 10, color: scene.ochreLight },
  down: { fontFamily: sceneFont.ui, fontSize: 10, color: scene.creamMuted },
});
