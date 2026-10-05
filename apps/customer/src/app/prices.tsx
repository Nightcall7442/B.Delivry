/**
 * «Цены базара» — the «Индекс базара» of a city: what the staples cost in the rows today, the move
 * since last week, the shops beside them and the line of eight weeks. The figures are the API's
 * (the same index the site shows); the screen only says them.
 */
import { changeText, tr, trendOf } from '@bazar/storefront';
import { Panel, Share, Text, api, color, useLocale } from '@bazar/mobile';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { SceneButton, scene } from '@/components/bazar';
import { Spark } from '@/components/prices/PriceBoard';
import { Bone, LoadError } from '@/components/ui/Page';
import { Shell } from '@/components/ui/Shell';
import { shareLink, WEB_URL } from '@/lib/share';
import { useLoad } from '@/lib/use-data';

const TONE = { up: color.danger, down: color.ink, flat: color.inkMuted } as const;
const ARROW = { up: '▲ ', down: '▼ ', flat: '' } as const;

/** The day and time in Tashkent, wherever the phone is. */
function asOf(t: ReturnType<typeof useLocale>['t'], iso: string): { date: string; time: string } {
  const at = new Date(iso);
  // Tashkent is UTC+5 all year.
  const local = new Date(at.getTime() + 5 * 3_600_000);
  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
  return {
    date: t.date(new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())),
    time,
  };
}

export default function PricesRoute() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { city: cityParam } = useLocalSearchParams<{ city?: string }>();
  // An empty `city` (a board without a city yet) is the busiest city's index.
  const cityId = cityParam ? cityParam : undefined;
  const load = useLoad(() => api().catalog.priceIndex(cityId), [cityId]);
  const index = load.data;
  const city = index?.city ? tr(index.city.name, locale) : '';
  const money = (amount: number) => t.money(amount, index?.currency);
  const week = index?.weekChangePercent ?? null;
  const cheaper = index?.cheaperThanShopsPercent ?? null;

  return (
    <Shell
      back="history"
      peek={0.6}
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text role="display" style={{ color: scene.cream, flex: 1 }}>
            {t('prices.title')}
          </Text>
          {index?.city ? (
            <SceneButton
              label={t('common.share')}
              onPress={() =>
                shareLink(
                  t('prices.shareText', { city }),
                  `${WEB_URL}/${locale}/prices?city=${index.city!.id}`,
                )
              }
            >
              <Share size={18} color={scene.ink} />
            </SceneButton>
          ) : null}
        </View>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('prices.intro')}
      </Text>

      {load.error ? (
        <View style={{ marginTop: 16 }}>
          <LoadError onRetry={() => void load.reload()} />
        </View>
      ) : index === null ? (
        <View style={{ gap: 10, marginTop: 16 }}>
          <Bone style={{ height: 90 }} />
          <Bone style={{ height: 320 }} />
        </View>
      ) : (
        <>
          {index.city ? (
            <Text role="caption" style={{ marginTop: 4 }}>
              {t('prices.asOf', { city, ...asOf(t, index.asOf) })}
            </Text>
          ) : null}

          {index.cities.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {index.cities.map((place) => {
                const here = place.id === index.city?.id;
                return (
                  <Pressable
                    key={place.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: here }}
                    onPress={() => router.setParams({ city: place.id })}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: here ? color.ink : color.tile,
                    }}
                  >
                    <Text role="body" style={{ color: here ? color.surface : color.ink }}>
                      {tr(place.name, locale)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {index.items.length === 0 ? (
            <Panel style={{ padding: 14, marginTop: 16 }}>
              <Text role="muted">{t('prices.empty')}</Text>
            </Panel>
          ) : (
            <>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                {cheaper !== null ? (
                  <Panel style={{ flex: 1, padding: 14 }}>
                    <Text role="caption">{t('prices.vsShops')}</Text>
                    <Text role="title" style={{ marginTop: 4 }}>
                      {t(cheaper >= 0 ? 'prices.cheaper' : 'prices.dearer', {
                        percent: Math.abs(cheaper),
                      })}
                    </Text>
                    <Text role="caption" style={{ marginTop: 4 }}>
                      {t('prices.vsShopsHint')}
                    </Text>
                  </Panel>
                ) : null}
                <Panel style={{ flex: 1, padding: 14 }}>
                  <Text role="caption">{t('prices.week')}</Text>
                  <Text role="title" style={{ marginTop: 4, color: TONE[trendOf(week)] }}>
                    {ARROW[trendOf(week)]}
                    {changeText(t, week)}
                  </Text>
                  <Text role="caption" style={{ marginTop: 4 }}>
                    {t('prices.weekHint')}
                  </Text>
                </Panel>
              </View>

              <Panel style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 4 }}>
                {index.items.map((item, i) => {
                  const trend = trendOf(item.changePercent);
                  const range =
                    item.min === item.max
                      ? t.n('prices.stalls', item.stalls)
                      : `${t.n('prices.stalls', item.stalls)} · ${t('prices.range', {
                          min: money(item.min),
                          max: money(item.max),
                        })}`;
                  return (
                    <View
                      key={item.key}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 12,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderColor: color.line,
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          role="title"
                          numberOfLines={1}
                          style={{ fontSize: 17, lineHeight: 24 }}
                        >
                          {tr(item.title, locale)}{' '}
                          <Text role="caption">
                            {t('prices.per', { per: tr(item.per, locale) })}
                          </Text>
                        </Text>
                        <Text role="caption" numberOfLines={1}>
                          {range}
                        </Text>
                        {item.shops !== null ? (
                          <Text role="caption" numberOfLines={1}>
                            {t('prices.shops', { price: money(item.shops) })}
                          </Text>
                        ) : null}
                      </View>
                      <Spark weeks={item.weeks} color={color.inkMuted} />
                      <View style={{ alignItems: 'flex-end', minWidth: 96 }}>
                        <Text role="body" style={{ fontWeight: '700', color: color.ink }}>
                          {money(item.median)}
                        </Text>
                        <Text role="caption" style={{ color: TONE[trend] }}>
                          {ARROW[trend]}
                          {changeText(t, item.changePercent)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </Panel>

              <Text role="title" style={{ marginTop: 24 }}>
                {t('prices.how')}
              </Text>
              <Text role="muted" style={{ marginTop: 4 }}>
                {t('prices.howBody')}
              </Text>
              <Text role="caption" style={{ marginTop: 6 }}>
                {t('prices.trend')}
              </Text>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
