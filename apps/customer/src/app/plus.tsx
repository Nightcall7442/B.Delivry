/** Bazar Plus: one screen, one price, three promises. */
import { PLUS } from '@bazar/constants';
import { isApiError } from '@bazar/api-client';
import { Button, Panel, Text, api, color, useAuth, useLocale } from '@bazar/mobile';

import { Ornament } from '@/components/ui/Ornament';
import { ONLINE_PROVIDERS, plusActive } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { Shell } from '@/components/ui/Shell';

const PERKS = ['plus.perk1', 'plus.perk2', 'plus.perk3'] as const;

export default function PlusRoute() {
  const router = useRouter();
  const { t } = useLocale();
  const { user, ready, refresh } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = plusActive(user);
  const price = t.money(PLUS.PRICE_MINOR);

  useEffect(() => {
    if (!user) return;
    api()
      .payments.balance()
      .then((wallet) => setBalance(wallet.amount))
      .catch(() => setBalance(0));
  }, [user]);

  const buy = async (method: 'BALANCE' | 'ONLINE', provider?: 'payme' | 'click') => {
    if (!user?.customerId) return;
    setBusy(true);
    setError(null);
    try {
      const payment = await api().payments.buyPlus(user.customerId, {
        method,
        ...(provider ? { provider } : {}),
        returnUrl: 'bazar-customer://plus',
      });
      if (payment.confirmationUrl) {
        await Linking.openURL(payment.confirmationUrl).catch(() => undefined);
      }
      await refresh();
    } catch (cause) {
      setError(isApiError(cause) ? cause.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const until = user?.plusUntil ? t.date(user.plusUntil) : '';

  return (
    <Shell
      back="history"
      expanded
      header={
        <Text role="display">
          {t('plus.title')}
          <Text role="display" style={{ color: color.saffron500 }}>
            .
          </Text>
        </Text>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('plus.tagline', { price })}
      </Text>
      <Panel style={{ marginTop: 16, padding: 14, gap: 8, overflow: 'hidden' }}>
        <Ornament color={color.saffron500} opacity={0.12} />
        {PERKS.map((key) => (
          <Text key={key} role="body">
            ✓ {t(key)}
          </Text>
        ))}
      </Panel>
      {active ? (
        <Text role="title" style={{ marginTop: 16, color: color.brand600 }}>
          {t('plus.activeUntil', { date: until })}
        </Text>
      ) : null}
      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/plus' } })}
        />
      ) : (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text role="caption">
            {active ? t('plus.extend', { price }) : t('plus.buy', { price })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ONLINE_PROVIDERS.map((option) => (
              <Button
                key={option.id}
                label={option.title}
                disabled={busy}
                style={{ flex: 1, height: 44 }}
                onPress={() => void buy('ONLINE', option.id)}
              />
            ))}
          </View>
          {balance !== null && balance >= PLUS.PRICE_MINOR ? (
            <Button
              label={t('plus.fromBalance', { balance: t.money(balance) })}
              disabled={busy}
              style={{ height: 44, backgroundColor: color.sand200 }}
              onPress={() => void buy('BALANCE')}
            />
          ) : balance !== null ? (
            <Text role="caption">{t('plus.notEnough', { balance: t.money(balance) })}</Text>
          ) : null}
          {error ? (
            <Text role="caption" style={{ color: color.danger }}>
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </Shell>
  );
}
