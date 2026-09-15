/** Invoices of a B2B customer: what is open, what is paid; the printable one opens on the web. */
import { Button, Panel, Text, api, color, useAuth, useLocale } from '@bazar/mobile';
import { paymentStatusText, tr } from '@bazar/storefront';
import type { OrderDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Shell } from '@/components/ui/Shell';

const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

export default function DocumentsRoute() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user, ready } = useAuth();
  const [rows, setRows] = useState<OrderDto[] | null>(null);
  useEffect(() => {
    if (!user) return;
    api()
      .orders.list({ paymentMethod: 'INVOICE', pageSize: 50 })
      .then((page) => setRows(page.items))
      .catch(() => setRows([]));
  }, [user]);
  const open = (rows ?? []).filter(
    (o) => o.paymentStatus !== 'CAPTURED' && o.status !== 'CANCELLED',
  );
  const openTotal = open.reduce((sum, o) => sum + o.totals.total.amount, 0);

  return (
    <Shell back="history" expanded header={<Text role="display">{t('docs.title')}</Text>}>
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('docs.intro')}
      </Text>
      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/documents' } })}
        />
      ) : rows === null ? null : rows.length === 0 ? (
        <Text role="muted" style={{ marginTop: 16 }}>
          {t('docs.empty')}
        </Text>
      ) : (
        <View style={{ marginTop: 12, gap: 8 }}>
          <Panel
            style={{
              padding: 12,
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: color.saffron100,
            }}
          >
            <Text role="body">{t('docs.open')}</Text>
            <Text role="title">{t.money(openTotal)}</Text>
          </Panel>
          {rows.map((order) => (
            <Pressable
              key={order.id}
              onPress={() => Linking.openURL(`${WEB_URL}/${locale}/orders/${order.id}/invoice`)}
            >
              <Panel style={{ padding: 12, gap: 2 }}>
                <Text role="body" style={{ fontWeight: '500' }}>
                  {order.number} · {tr(order.store.name, locale)} ·{' '}
                  {t.money(order.totals.total.amount)}
                </Text>
                <Text role="caption">
                  {t.date(order.placedAt)}
                  {order.dueAt ? ` · ${t('order.invoiceDue', { date: t.date(order.dueAt) })}` : ''}
                  {' · '}
                  {paymentStatusText(locale)[order.paymentStatus]} · {t('order.invoice')} ↗
                </Text>
              </Panel>
            </Pressable>
          ))}
        </View>
      )}
    </Shell>
  );
}
