import { describe, expect, it } from 'vitest';

import {
  getStore,
  isProductSort,
  listCategories,
  listProducts,
  listStores,
} from './catalog-data.js';
import type { CartStoreGroup } from './cart.js';
import { groupByStore } from './cart-group.js';
import { branchesOf, closesToday, isShopfront, oneTrip, shopfronts } from './shops.js';
import { basketGrams, estimateDelivery } from './pricing.js';
import { plural } from './text.js';

describe('listProducts', () => {
  it('sorts by price in both directions', async () => {
    const asc = await listProducts({ categoryId: 'meat', sort: 'price-asc' });
    const desc = await listProducts({ categoryId: 'meat', sort: 'price-desc' });

    expect(asc.map((p) => p.price.amount)).toEqual(
      [...asc.map((p) => p.price.amount)].sort((a, b) => a - b),
    );
    expect(desc[0]?.id).toBe(asc[asc.length - 1]?.id);
  });

  it('keeps out-of-stock goods out of the top of the popular list', async () => {
    const popular = await listProducts({ categoryId: 'household' });
    const unavailable = popular.findIndex((p) => !p.available);
    expect(unavailable).toBe(popular.length - 1);
  });

  it('filters by store and by category independently', async () => {
    const byStore = await listProducts({ storeId: 'non-uyi' });
    expect(byStore.every((p) => p.storeId === 'non-uyi')).toBe(true);

    const byCategory = await listProducts({ categoryId: 'fruits' });
    expect(byCategory.every((p) => p.categoryId === 'fruits')).toBe(true);
    expect(byCategory.length).toBeGreaterThan(0);
  });

  it('searches across every translation, not just the current locale', async () => {
    const ru = await listProducts({ search: 'персик' });
    const uz = await listProducts({ search: 'shaftoli' });
    expect(ru.map((p) => p.id)).toEqual(uz.map((p) => p.id));
    expect(ru[0]?.id).toBe('p-peach');
  });

  it('prices are whole tiyin — no float dust from the soum conversion', async () => {
    const all = await listProducts();
    expect(all.every((p) => Number.isInteger(p.price.amount))).toBe(true);
  });
});

describe('listCategories', () => {
  it('counts only the products that exist', async () => {
    const categories = await listCategories();
    const bakery = categories.find((c) => c.id === 'bakery');
    const bakeryProducts = await listProducts({ categoryId: 'bakery' });
    expect(bakery?.productCount).toBe(bakeryProducts.length);
  });
});

describe('listStores', () => {
  it('filters by type and finds one by id', async () => {
    const supermarkets = await listStores({ type: 'SUPERMARKET' });
    expect(supermarkets.map((s) => s.id)).toEqual([
      'makro-yunusabad',
      'korzinka-yunusabad',
      'korzinka-chilanzar',
    ]);
    expect(await getStore('makro-yunusabad')).not.toBeNull();
    expect(await getStore('nope')).toBeNull();
  });
});

describe('shopfronts', () => {
  it('shows a chain once, by the branch nearest the address', async () => {
    const stores = await listStores({});
    expect(stores.filter(isShopfront).map((s) => s.id)).toEqual([
      'makro-yunusabad',
      'korzinka-yunusabad',
      'korzinka-chilanzar',
      'lavka-yunusabad-4',
    ]);
    // no address yet: first branch of each chain
    expect(shopfronts(stores, null).map((s) => s.id)).toEqual([
      'makro-yunusabad',
      'korzinka-yunusabad',
      'lavka-yunusabad-4',
    ]);
    // from Chilanzar the other Korzinka wins, the rest stay put
    const chilanzar = { lat: 41.28, lng: 69.2 };
    expect(shopfronts(stores, chilanzar).map((s) => s.id)).toEqual([
      'makro-yunusabad',
      'korzinka-chilanzar',
      'lavka-yunusabad-4',
    ]);
    const korzinka = stores.find((s) => s.id === 'korzinka-yunusabad')!;
    expect(branchesOf(korzinka, stores, chilanzar).map((s) => s.id)).toEqual([
      'korzinka-chilanzar',
      'korzinka-yunusabad',
    ]);
    expect(branchesOf(stores[0]!, stores, chilanzar)).toEqual([stores[0]]);
  });
});

describe('isProductSort', () => {
  it('rejects anything that is not a known sort', () => {
    expect(isProductSort('price-asc')).toBe(true);
    expect(isProductSort('drop table')).toBe(false);
    expect(isProductSort(undefined)).toBe(false);
  });
});

describe('plural', () => {
  it('picks the Russian form for the tricky counts', () => {
    const форма = (n: number) => plural(n, 'товар', 'товара', 'товаров');
    expect([1, 2, 5, 11, 14, 21, 22, 25, 101, 112].map(форма)).toEqual([
      'товар',
      'товара',
      'товаров',
      'товаров',
      'товаров',
      'товар',
      'товара',
      'товаров',
      'товар',
      'товаров',
    ]);
  });
});

describe('shops in the basket', () => {
  it('never puts a shop on a shared trip and reads the closing hour by Tashkent weekday', async () => {
    const stores = await listStores({});
    const byId = new Map(stores.map((s) => [s.id, s]));
    const products = await listProducts({});
    const pick = (storeId: string) => products.find((p) => p.storeId === storeId)!.id;
    // Farhad's meat counter and the Chilanzar Korzinka are 250 m apart — still two trips.
    const stallAndShop = groupByStore(products, {
      [pick('farhad-meat')]: 1,
      [pick('korzinka-chilanzar')]: 1,
    });
    expect(oneTrip(stallAndShop, byId)).toBeNull();
    // Two counters of one bazaar do share a courier.
    const meat = byId.get('farhad-meat')!;
    const twin = { ...meat, id: 'farhad-twin' };
    const twoStalls: CartStoreGroup[] = [
      ...groupByStore(products, { [pick('farhad-meat')]: 1 }),
      { storeId: twin.id, lines: [], unavailable: [], subtotal: { amount: 0, currency: 'UZS' } },
    ];
    expect(oneTrip(twoStalls, new Map([...byId, [twin.id, twin]]))).toEqual([
      'farhad-meat',
      'farhad-twin',
    ]);

    const shop = byId.get('korzinka-yunusabad')!;
    expect(closesToday(shop, new Date('2026-09-19T10:00:00Z'))).toBe('23:00');
    expect(closesToday(meat, new Date('2026-09-19T10:00:00Z'))).toBe('18:00');
    expect(closesToday({ schedule: [] })).toBeNull();
  });
});

describe('estimateDelivery', () => {
  const chorsu = { lat: 41.3266, lng: 69.2347 };
  const home = { lat: 41.356, lng: 69.287 };
  it('follows the store threshold and never waives the car surcharge', () => {
    const paid = estimateDelivery(chorsu, home, 10, { subtotal: 60_000_00 }).fee.amount;
    expect(paid).toBeGreaterThan(0);
    // the shop's own threshold, not the zone's 200 000
    expect(
      estimateDelivery(chorsu, home, 10, {
        subtotal: 120_000_00,
        freeDeliveryThreshold: 100_000_00,
      }).fee.amount,
    ).toBe(0);
    expect(
      estimateDelivery(chorsu, home, 10, {
        subtotal: 250_000_00,
        weightGrams: basketGrams([{ product: { weightGrams: 25_000 }, quantity: 1 }]),
      }).fee.amount,
    ).toBe(15_000_00);
  });
});
