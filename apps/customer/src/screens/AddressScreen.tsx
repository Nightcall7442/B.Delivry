/**
 * Address by pin: drag the map under the fixed marker, the text follows.
 * Geolocation through expo-location; reverse geocoding through the same API
 * (no Yandex key needed for that part).
 */
import type { LatLngDto } from '@bazar/types';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Home, Row, Target, Button, Field, Text, api, color, useAuth, useT } from '@bazar/mobile';
import { addressLabel, fromAddressDto, type DeliveryAddress } from '@bazar/storefront';
import { Shell } from '@/components/ui/Shell';

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
      header={<Text role="display">{t('address.title')}</Text>}
      footer={<Button label={t('common.done')} onPress={save} />}
    >
      <View style={s.line}>
        <Field
          style={{ flex: 1 }}
          value={text}
          onChangeText={(value) => {
            setText(value);
            setTyped(true);
          }}
          placeholder={t('address.street')}
          autoComplete="street-address"
        />
        <Pressable
          onPress={locate}
          disabled={locating}
          style={[s.locate, locating && { opacity: 0.5 }]}
        >
          <Target size={22} color={color.brand600} />
        </Pressable>
      </View>
      {saved.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          {saved.map((row) => (
            <Row
              key={row.serverId}
              icon={<Home size={20} color={color.saffron600} />}
              tone="saffron"
              title={addressLabel(row.text)}
              subtitle={
                [
                  row.apartment ? t('address.apt', { value: row.apartment }) : '',
                  row.entrance ? t('address.entrance', { value: row.entrance }) : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || t('address.saved')
              }
              onPress={() => pick(row)}
            />
          ))}
        </View>
      ) : null}
      <Text role="muted" style={{ marginTop: 12 }}>
        {t('address.hint')}
      </Text>
    </Shell>
  );
}

const s = StyleSheet.create({
  line: { flexDirection: 'row', gap: 8, marginTop: 12 },
  locate: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: color.sand100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
