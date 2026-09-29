/**
 * An address's city is the city of the zone its pin falls in. Pricing looks for the zone only
 * inside the address's city, so a pin dragged from Tashkent to Urgench that kept its Tashkent row
 * read «outside every delivery zone» — the customer in Urgench was told «we only deliver in
 * Tashkent». These pin the city to the map, on save and on the copy an order keeps.
 */
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../../src/common/tenant/tenant-context.js';
import { systemContext } from '../../src/common/types/request-context.js';
import type { GeoService } from '../../src/modules/geo/service/geo.service.js';
import type { AddressesRepository } from '../../src/modules/addresses/repository/addresses.repository.js';
import { AddressesService } from '../../src/modules/addresses/service/addresses.service.js';
import type { AddressInput } from '../../src/modules/addresses/types/index.js';

const TASHKENT = 'city-tashkent';
const URGENCH = 'city-urgench';
const URGENCH_PIN = { lat: 41.5513, lng: 60.6317 };
const TASHKENT_PIN = { lat: 41.31, lng: 69.28 };

/** Two boxes standing in for the seeded zones. */
function zoneOf(point: { lat: number; lng: number }): string | null {
  if (point.lng > 60.54 && point.lng < 60.72 && point.lat > 41.5 && point.lat < 41.62)
    return URGENCH;
  if (point.lng > 69.13 && point.lng < 69.42 && point.lat > 41.2 && point.lat < 41.4)
    return TASHKENT;
  return null;
}

function service(saved: { cityId: string; lat: number | null; lng: number | null }) {
  const row = {
    id: 'a1',
    customerId: 'c1',
    ...saved,
    street: 'ул. Бузсув',
    house: null,
    apartment: null,
    entrance: null,
    floor: null,
    landmark: null,
    instructions: null,
    isDefault: true,
  };
  const created: AddressInput[] = [];
  const updated: Partial<AddressInput>[] = [];
  const repository = {
    async findById() {
      return row;
    },
    async countForCustomer() {
      return 0;
    },
    async create(_customerId: string, input: AddressInput) {
      created.push(input);
      return { ...row, ...input };
    },
    async update(_id: string, input: Partial<AddressInput>) {
      updated.push(input);
      return { ...row, ...input };
    },
  } as unknown as AddressesRepository;
  const geo = {
    async resolveZone(point: { lat: number; lng: number }, cityId?: string) {
      // Like the real one: a city narrows the search to that city's zones.
      const city = zoneOf(point);
      const hit = city !== null && (cityId === undefined || cityId === city) ? city : null;
      return { zone: null, cityId: hit, deliverable: hit !== null, reason: null };
    },
  } as unknown as GeoService;
  const logger = { error() {}, warn() {}, info() {}, debug() {} };
  const events = { async publish() {} };
  const svc = new AddressesService({
    repository,
    geo,
    logger,
    events,
  } as unknown as ConstructorParameters<typeof AddressesService>[0]);
  const context = {
    ...systemContext('t1', 'r1', 'ru'),
    system: undefined,
    user: { id: 'u1', customerId: 'c1', roles: ['CUSTOMER'] },
  } as unknown as Parameters<typeof runWithContext>[0];
  return {
    svc,
    created,
    updated,
    as: <T>(fn: () => Promise<T>) => runWithContext(context, fn),
  };
}

describe('address city follows the pin', () => {
  it('heals a Tashkent row whose pin is in Urgench when an order copies it', async () => {
    const { svc, as } = service({ cityId: TASHKENT, ...URGENCH_PIN });
    const frozen = await as(() => svc.getFrozen('a1', 'c1'));
    expect(frozen.cityId).toBe(URGENCH);
  });

  it('keeps the saved city when the pin is outside every zone', async () => {
    const { svc, as } = service({ cityId: TASHKENT, lat: 41.378, lng: 60.36 });
    const frozen = await as(() => svc.getFrozen('a1', 'c1'));
    expect(frozen.cityId).toBe(TASHKENT);
  });

  it('keeps the saved city when the address has no pin', async () => {
    const { svc, as } = service({ cityId: URGENCH, lat: null, lng: null });
    const frozen = await as(() => svc.getFrozen('a1', 'c1'));
    expect(frozen.cityId).toBe(URGENCH);
    expect(frozen.lat).toBeNull();
  });

  it('moves the saved city when the pin is dragged to another city', async () => {
    const { svc, updated, as } = service({ cityId: TASHKENT, ...TASHKENT_PIN });
    await as(() => svc.update('a1', { street: 'дехканский базар', point: URGENCH_PIN }));
    expect(updated[0]?.cityId).toBe(URGENCH);
  });

  it('leaves the city alone when an update does not touch the pin', async () => {
    const { svc, updated, as } = service({ cityId: TASHKENT, ...TASHKENT_PIN });
    await as(() => svc.update('a1', { apartment: '12' }));
    expect(updated[0]).toEqual({ apartment: '12' });
  });

  it('files a new address under the zone of its pin, whatever city the app guessed', async () => {
    const { svc, created, as } = service({ cityId: TASHKENT, lat: null, lng: null });
    await as(() => svc.create({ cityId: TASHKENT, street: 'Ургенч', point: URGENCH_PIN }));
    expect(created[0]?.cityId).toBe(URGENCH);
  });

  it('says a pin inside a zone is deliverable even if the row still names another city', async () => {
    const { svc, as } = service({ cityId: TASHKENT, ...URGENCH_PIN });
    expect(await as(() => svc.isDeliverable('a1'))).toBe(true);
  });
});
