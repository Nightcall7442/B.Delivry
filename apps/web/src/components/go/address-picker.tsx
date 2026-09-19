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

import bz from '@/components/bazar/bazar.module.css';
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
      setText(name ?? t('address.pin', { coords: coords(center) }));
    },
    [typed, t],
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
        <div className={bz.rcHead}>
          <span className={bz.rcTitle}>{t('address.title')}</span>
        </div>
      }
      footer={
        <button type="button" className={bz.rcCta} style={{ width: '100%' }} onClick={save}>
          {t('common.done')} →
        </button>
      }
    >
      {/* The address is written by hand on the slip; the target button finds the phone's own spot. */}
      <div className="flex items-end gap-2">
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setTyped(true);
          }}
          className={bz.field}
          placeholder={t('address.street')}
          autoComplete="street-address"
        />
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className={`${bz.payIcon} mb-1 disabled:opacity-50`}
          aria-label={t('address.myLocation')}
        >
          <Target />
        </button>
      </div>
      {saved.length > 0 ? (
        <ul className={`${bz.rcLines} mt-2`}>
          {saved.map((row) => (
            <li key={row.serverId}>
              <button type="button" className={bz.payRow} onClick={() => pick(row)}>
                <span className={bz.payIcon} aria-hidden>
                  <HomeGlyph />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className={`${bz.rcName} truncate`} style={{ display: 'block' }}>
                    {row.text}
                  </span>
                  <span className={bz.rcUnit}>
                    {[
                      row.apartment ? t('address.apt', { value: row.apartment }) : '',
                      row.entrance ? t('address.entrance', { value: row.entrance }) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ') || t('address.saved')}
                  </span>
                </span>
                <span className={bz.checkoutArrow} style={{ color: 'var(--pomegranate)' }}>
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className={bz.rcHint}>{t('address.hint')}</p>
    </GoShell>
  );
}
