/**
 * The API's refusals reach the customer as words. «Other city» is the one that needs an exit (the
 * basket has to go), so it must be told apart from «outside every zone» by the message alone.
 */
import { ApiError } from '@bazar/api-client';
import { describe, expect, it } from 'vitest';

import {
  describeOrderError,
  isOtherCityRefusal,
  orderReasonText,
  OTHER_CITY_REASON,
} from './checkout.js';

const refusal = (message: string) =>
  new ApiError(422, { code: 'UNDELIVERABLE_ADDRESS', message } as ConstructorParameters<
    typeof ApiError
  >[1]);

describe('order refusals', () => {
  it('recognises the other-city refusal and nothing else', () => {
    expect(isOtherCityRefusal(refusal(OTHER_CITY_REASON))).toBe(true);
    expect(isOtherCityRefusal(refusal('Address is outside every delivery zone'))).toBe(false);
    expect(isOtherCityRefusal(new Error(OTHER_CITY_REASON))).toBe(false);
    expect(isOtherCityRefusal(null)).toBe(false);
  });

  it('says it in both languages, and never that Tashkent is the only city', () => {
    for (const locale of ['ru', 'uz']) {
      const other = orderReasonText(OTHER_CITY_REASON, locale);
      const outOfZone = orderReasonText('Address is outside every delivery zone', locale);
      expect(other).toBeTruthy();
      expect(outOfZone).toBeTruthy();
      expect(other).not.toBe(outOfZone);
      expect(`${other} ${outOfZone}`).not.toMatch(/ташкент|toshkent/i);
    }
  });

  it('shows the customer the words, not the English code', () => {
    expect(describeOrderError(refusal(OTHER_CITY_REASON), 'ru')).toBe(
      orderReasonText(OTHER_CITY_REASON, 'ru'),
    );
  });
});
