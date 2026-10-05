/**
 * «Стать продавцом»: a stall or a corner shop applies from the customer app, the way Go Bazar and
 * Bazara invite merchants in. The desk calls, agrees the place and the commission, and approves;
 * from then on the seller stocks the stall in Bazar Seller.
 */
import { scene } from '@/components/bazar';
import { Glyph } from '@/components/ui/Page';
import {
  Basket,
  Button,
  Chip,
  Field,
  Panel,
  Scooter,
  Text,
  Wallet,
  api,
  color,
  radius,
  useAuth,
  useLocale,
} from '@bazar/mobile';
import type { VendorApplicationDto, VendorLegalType } from '@bazar/types';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Shell } from '@/components/ui/Shell';

const LEGAL: VendorLegalType[] = ['UNREGISTERED', 'INDIVIDUAL_ENTREPRENEUR', 'LLC'];

export default function SellerRoute() {
  const router = useRouter();
  const { t } = useLocale();
  const { user, ready } = useAuth();
  const [application, setApplication] = useState<VendorApplicationDto | null | undefined>();
  const [stall, setStall] = useState('');
  const [name, setName] = useState('');
  const [legalType, setLegalType] = useState<VendorLegalType>('UNREGISTERED');
  const [inn, setInn] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPhone(user.phone);
    setName([user.firstName, user.lastName].filter(Boolean).join(' '));
    api()
      .vendors.application()
      .then(setApplication)
      .catch(() => setApplication(null));
  }, [user]);

  const registered = legalType !== 'UNREGISTERED';
  const valid =
    stall.trim().length >= 2 &&
    name.trim().length >= 2 &&
    /^\+998\d{9}$/.test(phone.replace(/\s/g, '')) &&
    (!registered || inn.length === 9);

  const apply = async () => {
    setError(null);
    setBusy(true);
    try {
      const vendor = await api().vendors.apply({
        displayName: stall.trim(),
        legalName: name.trim(),
        legalType,
        phone: phone.replace(/\s/g, ''),
        ...(registered ? { taxId: inn } : {}),
      });
      setApplication({
        id: vendor.id,
        status: vendor.status,
        displayName: vendor.displayName,
        createdAt: new Date().toISOString(),
      });
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell
      back="history"
      expanded
      header={
        <Text role="display" style={{ color: scene.cream }}>
          {t('seller.title')}
        </Text>
      }
    >
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('seller.intro')}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {/* Three kraft tags lying flat on the sheet, as on «Для бизнеса». */}
        {(
          [
            [Basket, t('seller.perkCounter')],
            [Scooter, t('seller.perkCourier')],
            [Wallet, t('seller.perkPayout')],
          ] as const
        ).map(([icon, label]) => (
          <View
            key={label}
            style={{
              flex: 1,
              borderRadius: radius.paper,
              padding: 10,
              gap: 8,
              backgroundColor: color.field,
              borderWidth: 1,
              borderColor: color.lineStrong,
            }}
          >
            <Glyph icon={icon} size={34} tint={color.tile} stroke={color.brand500} />
            <Text role="caption" numberOfLines={3} style={{ color: color.ink, fontWeight: '600' }}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/seller' } })}
        />
      ) : application === undefined ? null : application !== null ? (
        <Panel style={{ marginTop: 16, padding: 14, gap: 6 }}>
          <Text role="title">{application.displayName}</Text>
          <Text role="muted">
            {application.status === 'ACTIVE'
              ? t('seller.approved')
              : application.status === 'PENDING'
                ? t('seller.pending')
                : t('seller.declined')}
          </Text>
        </Panel>
      ) : (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Field value={stall} onChangeText={setStall} placeholder={t('seller.stall')} />
          <Field value={name} onChangeText={setName} placeholder={t('seller.name')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LEGAL.map((type) => (
              <Chip
                key={type}
                label={t(`seller.legal.${type}`)}
                active={legalType === type}
                onPress={() => setLegalType(type)}
              />
            ))}
          </View>
          {registered ? (
            <Field
              value={inn}
              onChangeText={(v) => setInn(v.replace(/\D/g, '').slice(0, 9))}
              placeholder={t('business.inn')}
              keyboardType="number-pad"
            />
          ) : null}
          <Field
            value={phone}
            onChangeText={setPhone}
            placeholder="+998 90 123 45 67"
            keyboardType="phone-pad"
          />
          {error ? (
            <Text role="caption" style={{ color: color.danger }}>
              {error}
            </Text>
          ) : null}
          <Button
            label={busy ? t('common.loading') : t('seller.apply')}
            disabled={!valid || busy}
            onPress={() => void apply()}
          />
        </View>
      )}
    </Shell>
  );
}
