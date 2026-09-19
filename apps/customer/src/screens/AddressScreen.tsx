/**
 * Address by pin: drag the map under the fixed marker, the text follows.
 * Geolocation through expo-location; reverse geocoding through the same API
 * (no Yandex key needed for that part).
 */
import type { LatLngDto } from '@bazar/types';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { scene, sceneFont } from '@/components/bazar';
import { Shell } from '@/components/ui/Shell';
import { Home, Target, Button, api, noOutline, useAuth, useT } from '@bazar/mobile';
import { addressLabel, fromAddressDto, type DeliveryAddress } from '@bazar/storefront';

import { DEFAULT_POINT, useAddress } from '@/features/address/store';

const coords = (p: LatLngDto) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

async function describe(point: LatLngDto): Promise<string | null> {
  try {
    const [hit] = await Location.reverseGeocodeAsync({ latitude: point.lat, longitude: point.lng });
    if (!hit) return null;
    const street = [hit.street, hit.streetNumber].filter(Boolean).join(', ');
    return street || hit.name || hit.district || null;
  } catch {
    return null;
  }
}

export function AddressScreen() {
  const router = useRouter();
  const t = useT();
  const fmt = (p: LatLngDto) => t('address.pin', { coords: coords(p) });
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { address, setAddress } = useAddress();

  const [point, setPoint] = useState<LatLngDto>(address?.point ?? DEFAULT_POINT);
  const [text, setText] = useState(address?.text ?? '');
  // Typed text is the user's; geocoded text is replaced on the next move.
  const [typed, setTyped] = useState(Boolean(address?.text));
  const [locating, setLocating] = useState(false);
  const { user } = useAuth();
  const [saved, setSaved] = useState<DeliveryAddress[]>([]);

  // Second order in two taps: the addresses the API already knows.
  useEffect(() => {
    if (!user) return;
    api()
      .addresses.list()
      .then((rows) =>
        setSaved(rows.map(fromAddressDto).filter((row): row is DeliveryAddress => row !== null)),
      )
      .catch(() => setSaved([]));
  }, [user]);

  useEffect(() => {
    if (address) {
      setPoint(address.point);
      setText(address.text);
      setTyped(true);
    }
  }, [address]);

  const onMoveEnd = useCallback(
    async (center: LatLngDto) => {
      setPoint(center);
      if (typed) return;
      setText((await describe(center)) ?? fmt(center));
    },
    [typed],
  );

  const locate = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setTyped(false);
      await onMoveEnd({ lat: coords.latitude, lng: coords.longitude });
    } finally {
      setLocating(false);
    }
  };

  const save = () => {
    setAddress({ ...address, text: text.trim() || fmt(point), point });
    router.replace((next as Href | undefined) ?? '/');
  };

  const pick = (chosen: DeliveryAddress) => {
    setAddress(chosen);
    router.replace((next as Href | undefined) ?? '/');
  };

  return (
    <Shell
      back="history"
      peek={0.34}
      map={{ center: point, zoom: 16, pin: true, onMoveEnd }}
      header={<Text style={s.head}>{t('address.title').toUpperCase()}</Text>}
      footer={<Button label={`${t('common.done')} →`} onPress={save} />}
    >
      {/* The address is written by hand on the slip; the target finds the phone's own spot. */}
      <View style={s.line}>
        <TextInput
          style={s.field}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setTyped(true);
          }}
          placeholder={t('address.street')}
          placeholderTextColor="#A08F76"
          autoComplete="street-address"
        />
        <Pressable
          onPress={locate}
          disabled={locating}
          style={[s.locate, locating && { opacity: 0.5 }]}
          accessibilityLabel={t('address.myLocation')}
        >
          <Target size={20} color={scene.pomegranate} />
        </Pressable>
      </View>
      {saved.map((row) => (
        <Pressable
          key={row.serverId}
          onPress={() => pick(row)}
          style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
        >
          <View style={s.rowIcon}>
            <Home size={18} color={scene.pomegranate} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.rowName} numberOfLines={1}>
              {addressLabel(row.text)}
            </Text>
            <Text style={s.rowMeta} numberOfLines={1}>
              {[
                row.apartment ? t('address.apt', { value: row.apartment }) : '',
                row.entrance ? t('address.entrance', { value: row.entrance }) : '',
              ]
                .filter(Boolean)
                .join(' · ') || t('address.saved')}
            </Text>
          </View>
          <Text style={s.arrow}>→</Text>
        </Pressable>
      ))}
      <Text style={s.hint}>{t('address.hint')}</Text>
    </Shell>
  );
}

// The sheet is a receipt: a small-caps head over a dashed rule, handwriting on kraft, dashed lines.
const s = StyleSheet.create({
  head: {
    fontFamily: sceneFont.uiHeavy,
    fontSize: 11,
    letterSpacing: 1.8,
    color: scene.pomegranate,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: scene.paperEdge,
  },
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
  field: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: scene.paperEdge,
    backgroundColor: 'rgba(234,216,178,0.35)',
    fontFamily: sceneFont.hand,
    fontSize: 19,
    color: scene.ink,
    ...(noOutline as object),
  },
  locate: {
    width: 40,
    height: 40,
    marginBottom: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: scene.paperEdge,
    backgroundColor: scene.kraft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: scene.paperEdge,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: scene.kraft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: { fontFamily: sceneFont.display, fontSize: 19, lineHeight: 23, color: scene.ink },
  rowMeta: { fontFamily: sceneFont.uiText, fontSize: 12, color: '#7A6248' },
  arrow: { fontFamily: sceneFont.display, fontSize: 20, color: scene.pomegranate },
  hint: {
    marginTop: 10,
    fontFamily: sceneFont.uiText,
    fontSize: 13,
    lineHeight: 18,
    color: '#7A6248',
  },
});
