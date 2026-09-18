/** B2B: a café or canteen applies with its company; an operator grants invoice credit. */
import { scene } from '@/components/bazar';
import { Glyph } from '@/components/ui/Page';
import {
  Button,
  Field,
  Panel,
  Text,
  api,
  color,
  useAuth,
  useLocale,
  Receipt,
  Wallet,
  Scooter,
} from '@bazar/mobile';
import type { CustomerDto } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Shell } from '@/components/ui/Shell';

export default function BusinessRoute() {
  const router = useRouter();
  const { t } = useLocale();
  const { user, ready } = useAuth();
  const [me, setMe] = useState<CustomerDto | null>(null);
  const [company, setCompany] = useState('');
  const [inn, setInn] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    api()
      .customers.me()
      .then((row) => {
        setMe(row);
        setCompany(row.companyName ?? '');
        setInn(row.companyInn ?? '');
      })
      .catch(() => undefined);
  }, [user]);

  const apply = async () => {
    setError(null);
    try {
      setMe(
        await api().customers.applyBusiness({
          companyName: company.trim(),
          companyInn: inn.trim(),
        }),
      );
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
          {t('business.title')}
        </Text>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('business.intro')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {/* Three kraft tags, the same slip as the receipts — no pastel on paper. */}
        {(
          [
            [Receipt, t('business.perkInvoice')],
            [Wallet, t('business.perkCredit')],
            [Scooter, t('business.perkDaily')],
          ] as const
        ).map(([icon, label]) => (
          <View
            key={label}
            style={{
              flex: 1,
              borderRadius: 6,
              padding: 10,
              gap: 8,
              backgroundColor: scene.kraft,
              borderWidth: 1,
              borderColor: scene.paperEdge,
            }}
          >
            <Glyph icon={icon} size={34} tint="#FBF5E6" stroke={scene.pomegranate} />
            <Text role="caption" numberOfLines={2} style={{ color: color.ink, fontWeight: '600' }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/business' } })}
        />
      ) : me?.businessApprovedAt ? (
        <Panel style={{ marginTop: 16, padding: 14, gap: 6 }}>
          <Text role="title">{me.companyName}</Text>
          <Text role="muted">
            {t('business.approved', { days: me.creditDays, limit: t.money(me.creditLimit) })}
          </Text>
          <Text role="caption">{t('business.dailyHint')}</Text>
          <Pressable onPress={() => router.push('/documents')} hitSlop={6}>
            <Text role="muted" style={{ color: color.brand600, fontWeight: '500' }}>
              {t('docs.title')}
            </Text>
          </Pressable>
        </Panel>
      ) : me?.businessAppliedAt ? (
        <Panel style={{ marginTop: 16, padding: 14, gap: 6 }}>
          <Text role="title">
            {me.companyName} · {t('invoice.inn', { inn: me.companyInn ?? '' })}
          </Text>
          <Text role="muted">{t('business.pending')}</Text>
        </Panel>
      ) : (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Field value={company} onChangeText={setCompany} placeholder={t('business.company')} />
          <Field
            value={inn}
            onChangeText={(v) => setInn(v.replace(/\D/g, '').slice(0, 9))}
            placeholder={t('business.inn')}
            keyboardType="number-pad"
          />
          {error ? (
            <Text role="caption" style={{ color: color.danger }}>
              {error}
            </Text>
          ) : null}
          <Button
            label={t('business.apply')}
            disabled={company.trim().length < 2 || inn.length !== 9}
            onPress={() => void apply()}
          />
        </View>
      )}
    </Shell>
  );
}
