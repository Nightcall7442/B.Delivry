/**
 * The words under a pin. The bug this pins: Android's geocoder answered a spot it knew nothing about
 * with the bare country, and the customer read «Узбекистан» where an address should be.
 */
import { describe, expect, it } from 'vitest';

import { addressLabel, placeLabel } from './address.js';

const KHOREZM = {
  country: 'Узбекистан',
  region: 'Хорезмская область',
  subregion: 'Ургенчский район',
};

describe('placeLabel', () => {
  it('writes the street with its number', () => {
    expect(placeLabel({ ...KHOREZM, street: 'ул. Аль-Хорезми', streetNumber: '12' })).toBe(
      'ул. Аль-Хорезми, 12',
    );
  });

  it('is null when the geocoder knows only the country, the province or the district', () => {
    expect(placeLabel({ ...KHOREZM, name: 'Узбекистан' })).toBeNull();
    expect(placeLabel({ ...KHOREZM, name: 'узбекистан ' })).toBeNull();
    expect(placeLabel({ ...KHOREZM, name: 'Хорезмская область' })).toBeNull();
    expect(placeLabel({ ...KHOREZM, name: 'Ургенчский район' })).toBeNull();
    expect(placeLabel({ ...KHOREZM })).toBeNull();
  });

  it('is null for a bare house number, a postal code or an unnamed road', () => {
    expect(placeLabel({ ...KHOREZM, name: '12' })).toBeNull();
    expect(placeLabel({ ...KHOREZM, name: '220100' })).toBeNull();
    expect(placeLabel({ ...KHOREZM, name: 'Дорога без названия' })).toBeNull();
    expect(placeLabel({ ...KHOREZM, street: 'Unnamed Road', streetNumber: '5' })).toBeNull();
  });

  it('falls back from the name to the district to the town', () => {
    expect(placeLabel({ ...KHOREZM, name: 'Дехканский базар', city: 'Ургенч' })).toBe(
      'Дехканский базар',
    );
    expect(placeLabel({ ...KHOREZM, name: 'Узбекистан', district: 'Центр', city: 'Ургенч' })).toBe(
      'Центр',
    );
    expect(placeLabel({ ...KHOREZM, name: 'Узбекистан', city: 'Ургенч' })).toBe('Ургенч');
  });
});

describe('addressLabel', () => {
  it('hides the coordinates of a dropped pin', () => {
    expect(addressLabel('Точка на карте · 41.55130, 60.63170')).toBe('Точка на карте');
  });

  it('hides them when the API has appended the flat after them', () => {
    expect(addressLabel('Точка на карте · 41.55130, 60.63170, kv. 5')).toBe(
      'Точка на карте, kv. 5',
    );
  });

  it('leaves a written address alone', () => {
    expect(addressLabel('ул. Аль-Хорезми, 12')).toBe('ул. Аль-Хорезми, 12');
  });
});
