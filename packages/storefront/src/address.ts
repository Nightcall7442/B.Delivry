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

/**
 * The address as a headline: a dropped pin shows «Точка на карте», not its coordinates — also when
 * the API has appended «, кв. 5» after them.
 */
export const addressLabel = (text: string): string =>
  text.replace(/\s*·\s*-?\d+\.\d+,\s*-?\d+\.\d+/, '');

/** The fields of a reverse-geocoder answer that can name a place (expo-location's shape). */
export interface GeocodedPlace {
  street?: string | null;
  streetNumber?: string | null;
  name?: string | null;
  district?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  country?: string | null;
}

const UNNAMED_ROAD = /^(unnamed road|дорога без названия|nomsiz yo[ʻʼ'’`]?l)$/i;

/**
 * What to write under a pin: the street (with its number), else the place's own name, district or
 * town — and null when the geocoder knows nothing finer than the country, so the caller can show
 * the coordinates instead. Android answers with just «Узбекистан» (or the province, or a bare
 * house number) for spots it has no data on, and that is not an address.
 */
export function placeLabel(hit: GeocodedPlace): string | null {
  const coarse = new Set(
    [hit.country, hit.region, hit.subregion]
      .map((part) => (part ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  const clean = (part: string | null | undefined): string | null => {
    const value = (part ?? '').trim();
    if (!value || coarse.has(value.toLowerCase())) return null;
    // Digits alone are a house number or a postal code, never a name.
    if (/^[\d\s.,/-]+$/.test(value) || UNNAMED_ROAD.test(value)) return null;
    return value;
  };
  const street = clean(hit.street);
  if (street) return [street, (hit.streetNumber ?? '').trim()].filter(Boolean).join(', ');
  return clean(hit.name) ?? clean(hit.district) ?? clean(hit.city);
}

/** Tashkent centre: where the map opens before anyone picks a point. */
export const DEFAULT_POINT: LatLngDto = { lat: 41.3111, lng: 69.2797 };
