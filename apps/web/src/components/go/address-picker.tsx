/**
 * Address by pin: drag the map under the fixed marker, the text follows.
 * The GO gesture — nobody types a Tashkent address into a form on a phone.
 */
'use client';

import { fromAddressDto, type DeliveryAddress } from '@bazar/storefront';
import type { AddressDto, LatLngDto } from '@bazar/types';
import { createT } from '@bazar/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { HomeGlyph, Target } from '@/components/go/icons';
import { DEFAULT_POINT, useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';
import { describePoint, loadYmaps } from '@/lib/map/ymaps';

const coords = (p: LatLngDto) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

export function AddressPicker({ locale }: { locale: string }) {
  const t = createT(locale);
  const fmt = (p: LatLngDto) => t('address.pin', { coords: coords(p) });
  const router = useRouter();
  const next = useSearchParams().get('next');
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
      .then((rows: AddressDto[]) =>
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
      const api = await loadYmaps();
      const name = api ? await describePoint(api, [center.lng, center.lat]) : null;
      setText(name ?? fmt(center));
    },
    [typed],
  );

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        setTyped(false);
        void onMoveEnd({ lat: coords.latitude, lng: coords.longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const save = () => {
    setAddress({ ...address, text: text.trim() || fmt(point), point });
    router.push(next ?? `/${locale}`);
  };

  const pick = (chosen: DeliveryAddress) => {
    setAddress(chosen);
    router.push(next ?? `/${locale}`);
  };

  return (
    <GoShell
      locale={locale}
      back="history"
      peek={0.34}
      map={{ center: point, zoom: 16, pin: true, onMoveEnd }}
      header={
        <h1 className="font-display text-[22px] font-extrabold leading-7">{t('address.title')}</h1>
      }
      footer={
        <button type="button" className="btn-go" onClick={save}>
          {t('common.done')}
        </button>
      }
    >
      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setTyped(true);
          }}
          className="go-field"
          placeholder={t('address.street')}
          autoComplete="street-address"
        />
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-mute text-xl disabled:opacity-50"
          aria-label={t('address.myLocation')}
        >
          <Target />
        </button>
      </div>
      {saved.length > 0 ? (
        <ul className="-mx-3 mt-2">
          {saved.map((row) => (
            <li key={row.serverId}>
              <button type="button" className="go-row" onClick={() => pick(row)}>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-saffron-100 text-saffron-600"
                  aria-hidden
                >
                  <HomeGlyph />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{row.text}</span>
                  <span className="block text-xs text-ink-muted">
                    {[
                      row.apartment ? t('address.apt', { value: row.apartment }) : '',
                      row.entrance ? t('address.entrance', { value: row.entrance }) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || t('address.saved')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-sm text-ink-muted">{t('address.hint')}</p>
    </GoShell>
  );
}
