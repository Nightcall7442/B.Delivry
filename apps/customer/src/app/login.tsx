/**
 * Sign in by phone. The first screen a newcomer sees, so it sells the promise
 * first — the bazaar photo, the pitch, the three guarantees — and only then
 * asks for a number. `next` is where the customer was going.
 */
import { PHOTOS, photo } from '@bazar/storefront';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, Page, ui } from '@/components/ui/Page';
import {
  Leaf,
  LoginForm,
  Photo,
  Scale,
  Tag,
  Text,
  color,
  useAuth,
  useBrand,
  useT,
} from '@bazar/mobile';

export default function LoginRoute() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user, ready } = useAuth();
  const brand = useBrand();
  const target = (next && next.startsWith('/') ? next : '/') as Href;

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (ready && user) router.replace(target);
  }, [ready, user, router, target]);
  const t = useT();

  return (
    <Page back="history">
      <View style={s.hero}>
        <Photo uri={photo(PHOTOS['promo-chorsu'] ?? '', 960)} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(12,32,26,0)', 'rgba(12,32,26,0.35)', 'rgba(12,32,26,0.85)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={s.heroBody}>
          <Text role="display" style={s.wordmark}>
            {brand.appName}
            <Text role="display" style={[s.wordmark, { color: color.brand300 }]}>
              .
            </Text>
          </Text>
          <Text role="display" style={s.tagline}>
            {t('login.tagline')}
          </Text>
          <Text role="caption" style={s.taglineHint}>
            {t('login.taglineHint')}
          </Text>
        </View>
      </View>

      <View style={s.trust}>
        {(
          [
            [Scale, t('trust.weigh')],
            [Leaf, t('trust.fresh')],
            [Tag, t('trust.haggle')],
          ] as const
        ).map(([Icon, label]) => (
          <View key={label} style={s.trustItem}>
            <Icon size={16} color={ui.brandDeep} strokeWidth={2.2} />
            <Text role="caption" numberOfLines={2} style={s.trustText}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      <Card style={s.form}>
        <LoginForm onSignedIn={() => router.replace(target)} />
      </Card>
    </Page>
  );
}

const s = StyleSheet.create({
  hero: {
    height: 300,
    borderRadius: ui.radius,
    overflow: 'hidden',
    backgroundColor: color.sand200,
    justifyContent: 'flex-end',
    marginTop: 4,
    ...ui.shadow,
  },
  heroBody: { padding: 18, gap: 4 },
  wordmark: { color: color.white, fontSize: 30, lineHeight: 34 },
  tagline: { color: color.white, fontSize: 22, lineHeight: 26, marginTop: 6 },
  taglineHint: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 16 },
  trust: { flexDirection: 'row', gap: 8, marginTop: 12 },
  trustItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.tile,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  trustText: {
    textAlign: 'center',
    color: ui.brandDeep,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '600',
  },
  form: { marginTop: 12, padding: 16 },
});
