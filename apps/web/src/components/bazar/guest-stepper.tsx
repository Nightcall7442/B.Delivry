/**
 * «Сколько гостей?»: − 12 + on the scene's glass — one by one for a family, by fives for a toy
 * (`stepGuests`). The count is the hero of the row.
 */
'use client';

import type { T } from '@bazar/i18n';
import { stepGuests, type Bundle } from '@bazar/storefront';

import s from './bazar.module.css';

export function GuestStepper({
  bundle,
  guests,
  onChange,
  t,
}: {
  bundle: Bundle;
  guests: number;
  onChange: (guests: number) => void;
  t: T;
}) {
  const fewer = stepGuests(bundle, guests, -1);
  const more = stepGuests(bundle, guests, 1);
  return (
    <div className={s.guestRow}>
      <span className={s.guestLabel}>{t('bundle.guests')}</span>
      <button
        type="button"
        className={s.guestStep}
        onClick={() => onChange(fewer)}
        disabled={fewer === guests}
        aria-label={t('bundle.fewer')}
      >
        −
      </button>
      <output className={s.guestCount} aria-live="polite">
        {guests}
      </output>
      <button
        type="button"
        className={`${s.guestStep} ${s.guestStepMore}`}
        onClick={() => onChange(more)}
        disabled={more === guests}
        aria-label={t('bundle.more')}
      >
        +
      </button>
    </div>
  );
}
