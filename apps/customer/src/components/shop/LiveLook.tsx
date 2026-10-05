/**
 * «Покажите товар» on the good's page: the stall's fresh photos of this very good, and the button that
 * asks the seller for one now. While the ask waits the block says so and looks again every few
 * seconds — the photo also arrives as a push, but the page must not depend on one.
 */
import { latestLook, takenAgo } from '@bazar/storefront';
import type { LivePhotoDto, ProductLookDto } from '@bazar/types';
import { isApiError } from '@bazar/api-client';
import { Camera, Photo, api, radius, scale, useAuth, useLocale } from '@bazar/mobile';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { Eyebrow, Glass, Say, scene, sceneFont } from '@/components/bazar';

const POLL_SECONDS = 10;

export function LiveLook({ productId, open }: { productId: string; open: boolean }) {
  const router = useRouter();
  const { t } = useLocale();
  const { user } = useAuth();
  const [photos, setPhotos] = useState<LivePhotoDto[]>([]);
  const [ask, setAsk] = useState<ProductLookDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const read = useCallback(async () => {
    const [fresh, mine] = await Promise.all([
      api()
        .looks.ofProduct(productId)
        .catch(() => null),
      user
        ? api()
            .looks.mine(productId)
            .catch(() => null)
        : Promise.resolve([]),
    ]);
    if (fresh !== null) setPhotos(fresh);
    if (mine !== null) setAsk(latestLook(mine, productId));
  }, [productId, user]);

  useEffect(() => {
    void read();
  }, [read]);

  const waiting = ask?.status === 'WAITING';
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void read();
    }, POLL_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [waiting, read]);

  const request = async () => {
    if (!user) {
      router.push({ pathname: '/login', params: { next: `/product/${productId}` } });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      setAsk(await api().looks.ask(productId));
    } catch (error) {
      setNote(t(isApiError(error) && error.status === 409 ? 'look.tooMany' : 'look.failed'));
    } finally {
      setBusy(false);
    }
  };

  const latest = photos[0];
  const line = waiting
    ? t('look.waiting')
    : ask?.status === 'LAPSED' && photos.length === 0
      ? t('look.lapsed')
      : !open
        ? t('look.closed')
        : t('look.askHint');

  return (
    <View style={s.wrap}>
      {latest ? (
        <>
          <Eyebrow>{t('look.title')}</Eyebrow>
          <View style={s.photoFrame}>
            <Photo uri={latest.url} style={s.photo} />
            <Text style={s.ago}>{takenAgo(t, latest.takenAt)}</Text>
          </View>
        </>
      ) : null}
      {/* A waiting ask, or a closed stall, has nothing to press: the line says why. */}
      {waiting || !open ? (
        <Say step="lead" color={scene.creamMuted}>
          {line}
        </Say>
      ) : (
        <Glass
          onPress={() => {
            if (!busy) void request();
          }}
          style={s.button}
        >
          <Camera size={18} color={scene.ochreLight} />
          <View style={{ flex: 1 }}>
            <Text style={s.buttonText}>{t('look.ask')}</Text>
            <Text style={s.buttonHint}>{line}</Text>
          </View>
        </Glass>
      )}
      {note ? (
        <Text style={s.note} accessibilityRole="alert">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 18, gap: 10 },
  photoFrame: { borderRadius: radius.photo, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: scene.kraft },
  ago: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: scene.glass,
    fontFamily: sceneFont.ui,
    ...scale.caption,
    color: scene.cream,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.paper,
  },
  buttonText: { fontFamily: sceneFont.uiHeavy, ...scale.body, color: scene.cream },
  buttonHint: { fontFamily: sceneFont.uiText, ...scale.caption, color: scene.creamMuted },
  note: { fontFamily: sceneFont.ui, ...scale.caption, color: scene.ochreLight },
});
