import type { AddressDto, LatLngDto } from '@bazar/types';

/** Where an order goes: a point on the map plus what the courier reads at the door. */
export interface DeliveryAddress {
  text: string;
  point: LatLngDto;
  apartment?: string;
  entrance?: string;
  comment?: string;
  /** The saved copy on the server, once an order has needed one. */
  serverId?: string;
  cityId?: string;
}

/** A saved server address as the pickers use it; null when it has no point. */
export function fromAddressDto(dto: AddressDto): DeliveryAddress | null {
  if (dto.point === null) return null;
  const text =
    [dto.street, dto.house].filter((part): part is string => !!part).join(', ') ||
    dto.title ||
    `Точка на карте · ${dto.point.lat.toFixed(5)}, ${dto.point.lng.toFixed(5)}`;
  return {
    text,
    point: dto.point,
    ...(dto.apartment ? { apartment: dto.apartment } : {}),
    ...(dto.entrance ? { entrance: dto.entrance } : {}),
    ...(dto.instructions ? { comment: dto.instructions } : {}),
    serverId: dto.id,
    cityId: dto.cityId,
  };
}

/** The address as a headline: a dropped pin shows «Точка на карте», not its coordinates. */
export const addressLabel = (text: string): string =>
  text.replace(/\s*·\s*-?\d+\.\d+,\s*-?\d+\.\d+$/, '');

/** Tashkent centre: where the map opens before anyone picks a point. */
export const DEFAULT_POINT: LatLngDto = { lat: 41.3111, lng: 69.2797 };
