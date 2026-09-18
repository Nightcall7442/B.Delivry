/** "Стать курьером махалли": a customer volunteers to walk orders to neighbours. */
import { NEIGHBOUR_COURIER } from '@bazar/constants';
import { Button, Panel, Text, api, color, useAuth, useLocale } from '@bazar/mobile';
import { ensureServerAddress } from '@bazar/storefront';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Shell } from '@/components/ui/Shell';
import { useAddress } from '@/features/address/store';

export default function NeighbourRoute() {
  const router = useRouter();
  const { address, setAddress } = useAddress();
  const { t } = useLocale();
  const { user, ready } = useAuth();
  const [done, setDone] = useState(Boolean(user?.courierId));
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (!address) {
      setError(t('neighbour.needAddress'));
      return;
    }
    setError(null);
    try {
      const addressId = await ensureServerAddress(api(), address, setAddress);
      await api().couriers.apply(addressId);
      setDone(true);
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <Shell
      back="history"
      expanded
      header={
        <Text role="display" style={{ color: '#FBF1DE' }}>
          {t('neighbour.title')}
        </Text>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('neighbour.intro', { km: NEIGHBOUR_COURIER.HOME_RADIUS_METERS / 1000 })}
      </Text>
      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/neighbour' } })}
        />
      ) : done ? (
        <Panel style={{ marginTop: 16, padding: 14 }}>
          <Text role="body">{t('neighbour.applied')}</Text>
        </Panel>
      ) : (
        <>
          <Text role="body" style={{ marginTop: 12 }}>
            {t('checkout.where')}: {address?.text ?? '—'}
          </Text>
          {error ? (
            <Text role="caption" style={{ marginTop: 6, color: color.danger }}>
              {error}
            </Text>
          ) : null}
          <Button
            label={t('neighbour.apply')}
            style={{ marginTop: 16 }}
            onPress={() => void apply()}
          />
        </>
      )}
    </Shell>
  );
}
