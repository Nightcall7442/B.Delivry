/** "Every Saturday by 8:00": the baskets that place themselves. */
import { Button, Panel, Text, api, color, useAuth, useLocale, Receipt } from '@bazar/mobile';
import { slotLabel, subscriptionWhen, tr } from '@bazar/storefront';
import type { CartSubscriptionDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { EmptyState } from '@/components/ui/Page';
import { Shell } from '@/components/ui/Shell';

export default function SubscriptionsRoute() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<CartSubscriptionDto[] | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    api()
      .subscriptions.list()
      .then(setRows)
      .catch(() => setRows([]));
  }, [user]);
  useEffect(load, [load]);

  const patch = (id: string, active: boolean) =>
    api()
      .subscriptions.update(id, { active })
      .then(load)
      .catch(() => undefined);
  const remove = (id: string) =>
    api()
      .subscriptions.remove(id)
      .then(load)
      .catch(() => undefined);

  return (
    <Shell back="history" expanded header={<Text role="display">{t('subs.title')}</Text>}>
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('subs.intro')}
      </Text>
      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/subscriptions' } })}
        />
      ) : rows === null ? null : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('subs.emptyTitle')}
          hint={t('subs.empty')}
          action={t('subs.toOrders')}
          onAction={() => router.push('/orders')}
        />
      ) : (
        <View style={{ gap: 12, marginTop: 16 }}>
          {rows.map((row) => (
            <Panel key={row.id} style={{ padding: 14, gap: 6 }}>
              <Text role="title">{subscriptionWhen(row, locale)}</Text>
              <Text role="muted">
                {tr(row.storeName, locale)} · {t.n('cart.items', row.items.length)} ·{' '}
                {row.addressText}
              </Text>
              <Text role="caption">
                {row.active
                  ? t('subs.next', { when: slotLabel(row.nextRunAt, locale) })
                  : t('subs.paused')}
              </Text>
              {row.lastError ? (
                <Text role="caption" style={{ color: color.danger }}>
                  {t('subs.lastError', { error: row.lastError })}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <Pressable onPress={() => void patch(row.id, !row.active)} hitSlop={8}>
                  <Text role="muted" style={{ color: color.brand600, fontWeight: '500' }}>
                    {row.active ? t('subs.pause') : t('subs.resume')}
                  </Text>
                </Pressable>
                {row.lastOrderId ? (
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/order/[orderId]',
                        params: { orderId: row.lastOrderId ?? '' },
                      })
                    }
                    hitSlop={8}
                  >
                    <Text role="muted" style={{ fontWeight: '500' }}>
                      {t('subs.lastOrder')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => void remove(row.id)} hitSlop={8}>
                  <Text role="muted" style={{ color: color.danger }}>
                    {t('subs.delete')}
                  </Text>
                </Pressable>
              </View>
            </Panel>
          ))}
        </View>
      )}
    </Shell>
  );
}
