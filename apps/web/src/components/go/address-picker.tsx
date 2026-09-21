/**
 * Address by pin: drag the map under the fixed marker, the text follows.
 * The GO gesture — nobody types a Tashkent address into a form on a phone.
 */
'use client';

import {
  FREE_DELIVERY_THRESHOLD,
  PHOTOS,
  fromAddressDto,
  tripsTo,
  type DeliveryAddress,
} from '@bazar/storefront';
import type { AddressDto, LatLngDto } from '@bazar/types';
import { createT, type MessageKey } from '@bazar/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import bz from '@/components/bazar/bazar.module.css';
import { GoShell } from '@/components/go/go-shell';
import { HomeGlyph, Target } from '@/components/go/icons';
import { PIN_SVG, type MarkerKind } from '@/components/map/map-view';
import { DEFAULT_POINT, useAddress } from '@/features/address';
import { useAuth } from '@/features/auth';
import { api } from '@/lib/api';
import { describePoint, loadYmaps } from '@/lib/map/ymaps';

const coords = (p: LatLngDto) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
/** Past this the pin is out among the fields, and the board says so. */
const FAR_METERS = 20_000;
const LEGEND = [
  ['home', 'address.legendHome'],
  ['store', 'address.legendStore'],
  ['courier', 'address.legendCourier'],
] as const satisfies ReadonlyArray<readonly [MarkerKind, MessageKey]>;

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

  // The tariff board: every bazaar's ride to this pin, nearest first — it
  // re-prices as the map moves, so the sheet is never a blank slip.
  const trips = tripsTo(point);
  const far = (trips[0]?.trip.distanceMeters ?? 0) > FAR_METERS;
  const name = (bazaar: { name: { ru: string; uz: string } }) =>
    locale === 'uz' ? bazaar.name.uz : bazaar.name.ru;

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
      {/* One column the height of the sheet, so the legend sits at the foot on a desktop. */}
      <div className="flex min-h-full flex-col">
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

        <h2 className={bz.rcSection}>{t('address.from')}</h2>
        <ul className={bz.rcLines}>
          {trips.map(({ bazaar, trip }, i) => (
            <li
              key={bazaar.key}
              className={bz.rcLine}
              style={{ alignItems: 'center', padding: '10px 0' }}
            >
              <span
                className={bz.thumb}
                style={{ backgroundImage: `url(${PHOTOS[bazaar.photo]})` }}
                aria-hidden
              />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className={bz.rcName}>
                  {name(bazaar)}
                  {i === 0 && !far ? (
                    <span
                      className={bz.stamp}
                      style={{
                        margin: '0 0 0 10px',
                        padding: '2px 8px',
                        fontSize: 15,
                        verticalAlign: 'middle',
                      }}
                    >
                      {t('address.nearest')}
                    </span>
                  ) : null}
                </span>
                <span className={bz.rcUnit}>
                  {t('address.trip', {
                    km: t.qty(Math.round(trip.distanceMeters / 100) / 10),
                    min: trip.etaMinutes,
                  })}
                </span>
              </span>
              <span className={bz.rcSum}>{t.money(trip.fee.amount)}</span>
            </li>
          ))}
        </ul>
        {far ? <span className={bz.stamp}>{t('address.far')}</span> : null}
        <p className={bz.rcHint}>
          {t('address.fromHint', { threshold: t.money(FREE_DELIVERY_THRESHOLD.amount) })}
        </p>

        {/* The three majolica tiles the map draws, explained once. */}
        <div className="h-5" />
        <h2 className={bz.rcSection} style={{ marginTop: 'auto' }}>
          {t('address.legend')}
        </h2>
        <ul className="mt-3 flex list-none justify-around gap-2 p-0">
          {LEGEND.map(([kind, key]) => (
            <li key={kind} className="flex flex-col items-center gap-1 text-center">
              <span className={`map-pin map-pin--${kind}`}>
                <span
                  className="map-pin__glyph"
                  dangerouslySetInnerHTML={{ __html: PIN_SVG[kind] }}
                />
              </span>
              <span className={bz.rcUnit}>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </GoShell>
  );
}
