/** Referral: my code to share, or a friend's code to enter before the first order. */
import { Glyph } from '@/components/ui/Page';
import { isApiError } from '@bazar/api-client';
import { REFERRAL_BONUS_MINOR } from '@bazar/constants';
import { Button, Field, Panel, Text, api, color, useAuth, useLocale, Gift } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Shell } from '@/components/ui/Shell';

const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'http://localhost:3000';

export default function InviteRoute() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const { user, ready } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [friend, setFriend] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api()
      .customers.referral()
      .then((r) => setCode(r.code))
      .catch(() => undefined);
  }, [user]);

  const link = code ? `${WEB_URL}/${locale}?ref=${code}` : '';
  const apply = async () => {
    try {
      await api().customers.applyReferral(friend);
      setNote(t('invite.applied'));
    } catch (cause) {
      setNote(isApiError(cause) ? cause.message : t('common.error'));
    }
  };

  return (
    <Shell back="history" expanded header={<Text role="display">{t('invite.title')}</Text>}>
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('invite.intro', { bonus: t.money(REFERRAL_BONUS_MINOR) })}
      </Text>
      {!ready ? null : !user ? (
        <Button
          label={t('common.signIn')}
          style={{ marginTop: 16 }}
          onPress={() => router.push({ pathname: '/login', params: { next: '/invite' } })}
        />
      ) : (
        <>
          <Panel style={{ marginTop: 16, padding: 14, gap: 8, alignItems: 'center' }}>
            <Glyph icon={Gift} size={80} />
            <Text role="caption">{t('invite.yourCode')}</Text>
            <Text role="display" style={{ letterSpacing: 4, color: color.brand600 }}>
              {code ?? '······'}
            </Text>
            <Button
              label={t('invite.share')}
              disabled={!code}
              style={{ height: 44, alignSelf: 'stretch' }}
              onPress={() => void Share.share({ message: link }).catch(() => undefined)}
            />
          </Panel>
          <Text role="caption" style={{ marginTop: 16 }}>
            {t('invite.haveCode')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Field
              value={friend}
              onChangeText={(v) => setFriend(v.toUpperCase())}
              placeholder={t('invite.codePlaceholder')}
              autoCapitalize="characters"
              style={{ flex: 1, height: 44 }}
            />
            <Button
              label={t('invite.apply')}
              disabled={friend.trim().length < 4}
              style={{ height: 44, paddingHorizontal: 16 }}
              onPress={() => void apply()}
            />
          </View>
          {note ? (
            <Text role="caption" style={{ marginTop: 8 }}>
              {note}
            </Text>
          ) : (
            <Text role="caption" style={{ marginTop: 8 }}>
              {t('invite.onlyBefore')}
            </Text>
          )}
          <Text role="title" style={{ marginTop: 20 }}>
            {t('invite.how')}
          </Text>
          <Panel style={{ marginTop: 10, padding: 14, gap: 12 }}>
            {[
              t('invite.step1'),
              t('invite.step2', { bonus: t.money(REFERRAL_BONUS_MINOR) }),
              t('invite.step3'),
            ].map((step, i) => (
              <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={s.stepNo}>
                  <Text role="caption" style={{ color: color.brand600, fontWeight: '700' }}>
                    {i + 1}
                  </Text>
                </View>
                <Text role="body" style={{ flex: 1, fontSize: 15 }}>
                  {step}
                </Text>
              </View>
            ))}
          </Panel>
        </>
      )}
    </Shell>
  );
}

const s = StyleSheet.create({
  stepNo: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
