/**
 * «Ош на N человек» on the home: how many guests, and the plov is counted by the kazan's rule —
 * meat, rice, carrots, oil and cumin from the stalls nearby — in one tap to the set.
 */
import { bundleGuests, getBundle } from '@bazar/storefront';
import { radius, scale, shadow, useLocale } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Eyebrow, scene, sceneFont } from '@/components/bazar';
import { GuestStepper } from '@/components/shop/GuestStepper';

const PLOV = getBundle('plov');
/** A table of friends: where the stepper starts. */
const START = 8;

export function OshCard() {
  const router = useRouter();
  const { t } = useLocale();
  const [guests, setGuests] = useState(PLOV ? bundleGuests(PLOV, START) : START);
  if (!PLOV) return null;
  return (
    <View style={s.card}>
      <Eyebrow>{t('osh.eyebrow')}</Eyebrow>
      <Text style={s.question}>{t('osh.question')}</Text>
      <Text style={s.hint}>{t('osh.hint')}</Text>
      <GuestStepper bundle={PLOV} guests={guests} onChange={setGuests} label={t('bundle.guests')} />
      <Pressable
        onPress={() =>
          router.push({ pathname: '/bundle/[slug]', params: { slug: PLOV.slug, guests } })
        }
        accessibilityRole="link"
        style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}
      >
        <Text style={s.ctaText}>{t('osh.cta')}</Text>
        <Text style={s.ctaText}>→</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    gap: 10,
    borderRadius: radius.paper,
    backgroundColor: scene.glass,
    borderWidth: 1,
    borderColor: scene.glassEdge,
    ...shadow.paper,
  },
  question: { fontFamily: sceneFont.display, ...scale.title, color: scene.cream },
  hint: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted, marginTop: -4 },
  cta: {
    marginTop: 4,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: scene.pomegranate,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  ctaText: { fontFamily: sceneFont.display, ...scale.lead, color: scene.cream },
});
