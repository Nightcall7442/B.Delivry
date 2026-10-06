/**
 * Addresses business logic. Customer delivery addresses, defaults, order snapshots.
 */
import { LIMITS } from '@bazar/constants';
import type { Address } from '@prisma/client';
import { BaseService, type ServiceDeps } from '../../../common/base/base.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/domain.errors.js';
import type { GeoService } from '../../geo/service/geo.service.js';
import type { AddressesRepository } from '../repository/addresses.repository.js';
import type { AddressInput, FrozenAddress } from '../types/index.js';

export interface AddressesServiceDeps extends ServiceDeps {
  repository: AddressesRepository;
  geo: GeoService;
}

export class AddressesService extends BaseService {
  private readonly repository: AddressesRepository;
  private readonly geo: GeoService;

  constructor(deps: AddressesServiceDeps) {
    super(deps);
    this.repository = deps.repository;
    this.geo = deps.geo;
  }

  private customerId(): string {
    const id = this.currentUser().customerId;
    if (id === undefined) throw new ForbiddenError('Customer profile required');
    return id;
  }

  async list(): Promise<Address[]> {
    return this.repository.listForCustomer(this.customerId());
  }

  async get(id: string): Promise<Address> {
    const address = await this.repository.findById(id, this.customerId());
    if (address === null) throw new NotFoundError('Address', id);
    return address;
  }

  async create(input: AddressInput): Promise<Address> {
    const customerId = this.customerId();

    const count = await this.repository.countForCustomer(customerId);
    if (count >= LIMITS.CUSTOMER_MAX_ADDRESSES) {
      throw new ConflictError(`At most ${LIMITS.CUSTOMER_MAX_ADDRESSES} saved addresses`);
    }

    // A pin makes the address routable; without one the courier has only the
    // text. Warn rather than refuse: many mahalla addresses have no pin.
    if (input.point === undefined) {
      this.logger.debug({ customerId }, 'address saved without map location');
    }

    return this.repository.create(customerId, {
      ...input,
      cityId: await this.cityFor(input.point, input.cityId),
    });
  }

  async update(id: string, input: Partial<AddressInput>): Promise<Address> {
    const current = await this.get(id);
    // A moved pin moves the city with it: an address saved in Tashkent and dragged to Urgench
    // must not keep pricing against Tashkent's zones.
    if (input.point === undefined) return this.repository.update(id, input);
    const cityId = await this.cityFor(input.point, input.cityId ?? current.cityId);
    return this.repository.update(id, { ...input, cityId });
  }

  /**
   * The city an address belongs to is the city of the zone its pin falls in, not whatever the app
   * knew when the row was saved — pricing looks for the zone only inside the address's city, so a
   * stale one reads as «Address is outside every delivery zone» for a pin that is well inside
   * another city's zone. No pin, or a pin outside every zone: the saved city stands.
   */
  private async cityFor(
    point: { lat: number; lng: number } | null | undefined,
    saved: string,
  ): Promise<string> {
    if (point === undefined || point === null) return saved;
    const resolution = await this.geo.resolveZone(point);
    return resolution.deliverable ? (resolution.cityId ?? saved) : saved;
  }

  async setDefault(id: string): Promise<void> {
    await this.get(id);
    await this.repository.setDefault(this.customerId(), id);
  }

  async remove(id: string): Promise<void> {
    await this.get(id);
    await this.repository.softDelete(id);
  }

  /**
   * The copy an order keeps. Called with an explicit customerId because the
   * order flow has already established who is ordering, and because an
   * operator placing an order by phone is not the customer.
   */
  async getFrozen(id: string, customerId: string): Promise<FrozenAddress> {
    const address = await this.repository.findById(id, customerId);
    if (address === null) throw new NotFoundError('Address', id);

    const point =
      address.lat === null || address.lng === null
        ? null
        : { lat: Number(address.lat), lng: Number(address.lng) };

    return {
      // Rows saved before the city followed the pin heal here, so the order (and the courier
      // search that matches on its city) lands where the pin is.
      cityId: await this.cityFor(point, address.cityId),
      formatted: formatAddress(address),
      street: address.street,
      house: address.house,
      apartment: address.apartment,
      entrance: address.entrance,
      floor: address.floor,
      landmark: address.landmark,
      instructions: address.instructions,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
    };
  }

  async defaultFor(customerId: string): Promise<string> {
    const address = await this.repository.findDefault(customerId);
    if (address === null) throw new NotFoundError('Default address');
    return address.id;
  }

  /** Checks a saved address falls inside a delivery zone, before checkout does. */
  async isDeliverable(id: string): Promise<boolean> {
    const address = await this.get(id);
    if (address.lat === null || address.lng === null) return false;
    const resolution = await this.geo.resolveZone({
      lat: Number(address.lat),
      lng: Number(address.lng),
    });
    return resolution.deliverable;
  }
}

/**
 * One human-readable line for the courier. Landmark comes last but is often
 * the part they actually navigate by. The house number follows the street bare («ул. Навои, 12»),
 * as on every sign in Tashkent; the flat is «кв.», not the transliterated «kv.» that read as a typo
 * in the Russian UI.
 */
export function formatAddress(address: Address): string {
  const parts = [
    address.street,
    address.house,
    address.apartment === null || address.apartment === '' ? null : `кв. ${address.apartment}`,
    address.landmark,
  ].filter((part): part is string => part !== null && part.length > 0);

  return parts.join(', ');
}
