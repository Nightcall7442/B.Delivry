/**
 * Why a quote is refused matters to the customer: a pin that lies in another city's zone is not
 * «outside every delivery zone» — the point of sale is in the wrong city for them (a Tashkent
 * stall left in the basket of someone standing in Urgench).
 */
import { describe, expect, it } from 'vitest';
import { UndeliverableAddressError } from '../../src/common/errors/domain.errors.js';
import type { GeoService } from '../../src/modules/geo/service/geo.service.js';
import type { PricingRepository } from '../../src/modules/pricing/repository/pricing.repository.js';
import {
  OTHER_CITY_REASON,
  PricingService,
  type QuoteRequest,
} from '../../src/modules/pricing/service/pricing.service.js';

const TASHKENT = 'city-tashkent';
const URGENCH = 'city-urgench';
const URGENCH_PIN = { lat: 41.5513, lng: 60.6317 };
const KHIVA_PIN = { lat: 41.378, lng: 60.36 };
const OUT = 'Address is outside every delivery zone';

function pricing() {
  const geo = {
    // Two cities, one zone each; a city narrows the search to its own zone.
    async resolveZone(point: { lat: number; lng: number }, cityId?: string) {
      const city = point.lng > 60.54 && point.lng < 60.72 ? URGENCH : null;
      const hit = city !== null && (cityId === undefined || cityId === city) ? city : null;
      return { zone: null, cityId: hit ?? cityId ?? null, deliverable: hit !== null, reason: OUT };
    },
  } as unknown as GeoService;
  return new PricingService({
    repository: {} as PricingRepository,
    geo,
    maps: {} as never,
    logger: { error() {}, warn() {}, info() {}, debug() {} },
    events: { async publish() {} },
  } as unknown as ConstructorParameters<typeof PricingService>[0]);
}

const request = (to: QuoteRequest['to'], cityId?: string): QuoteRequest =>
  ({
    from: { lat: 41.31, lng: 69.28 },
    to,
    subtotal: { amount: 50_000, currency: 'UZS' },
    ...(cityId === undefined ? {} : { cityId }),
  }) as QuoteRequest;

const refusal = async (req: QuoteRequest): Promise<string> => {
  try {
    await pricing().quote(req);
  } catch (error) {
    if (error instanceof UndeliverableAddressError) return error.message;
    throw error;
  }
  return 'quoted';
};

describe('quote refusals', () => {
  it('says the point of sale is in another city when the pin is in a different city zone', async () => {
    expect(await refusal(request(URGENCH_PIN, TASHKENT))).toBe(OTHER_CITY_REASON);
  });

  it('keeps «outside every zone» for a pin no zone covers', async () => {
    expect(await refusal(request(KHIVA_PIN, TASHKENT))).toBe(OUT);
  });

  it('keeps «outside every zone» when no city narrowed the search', async () => {
    expect(await refusal(request(KHIVA_PIN))).toBe(OUT);
  });
});
