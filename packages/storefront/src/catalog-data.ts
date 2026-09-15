/**
 * Catalog data for the storefront screens.
 *
 * ponytail: in-memory fixtures. The shapes are the real DTOs and the accessors
 * are already async, so switching to `@bazar/api-client` is a change of function
 * bodies and nothing else — no screen touches this module's internals.
 */
import { PRODUCT_UNIT, STORE_TYPE, type StoreType } from '@bazar/constants';
import type { CategoryDto, LatLngDto, ProductDto, StoreDto } from '@bazar/types';

import { PHOTOS } from './photos.js';

/** A store the map can show. Points without coordinates are not deliverable, so the storefront never sees them. */
export type MapStoreDto = StoreDto & { point: LatLngDto };

const TENANT = 'tenant-uz';
const NOW = '2026-01-01T00:00:00.000Z';

const stamps = { createdAt: NOW, updatedAt: NOW } as const;

/** Category id -> the glyph the cards use in place of photography. */
export const CATEGORY_GLYPH: Record<string, string> = {
  vegetables: '🥬',
  fruits: '🍑',
  meat: '🥩',
  dairy: '🧀',
  bakery: '🍞',
  grocery: '🫘',
  spices: '🌶️',
  household: '🧴',
};

function category(id: string, ru: string, uz: string, sortOrder: number): CategoryDto {
  return {
    id,
    ...stamps,
    name: { ru, uz, en: id },
    slug: id,
    parentId: null,
    path: id,
    depth: 0,
    iconUrl: null,
    imageUrl: null,
    sortOrder,
    active: true,
  };
}

const CATEGORIES: CategoryDto[] = [
  category('vegetables', 'Овощи и зелень', 'Sabzavot va koʻkatlar', 1),
  category('fruits', 'Фрукты и ягоды', 'Mevalar', 2),
  category('meat', 'Мясо и птица', 'Goʻsht va parranda', 3),
  category('dairy', 'Молочное и яйца', 'Sut mahsulotlari', 4),
  category('bakery', 'Хлеб и выпечка', 'Non va pishiriqlar', 5),
  category('grocery', 'Бакалея', 'Baqqollik', 6),
  category('spices', 'Специи и сухофрукты', 'Ziravorlar', 7),
  category('household', 'Бытовое', 'Maishiy', 8),
];

function store(
  id: string,
  ru: string,
  uz: string,
  type: StoreType,
  options: {
    address: string;
    point: [lat: number, lng: number];
    stand?: string;
    rating: number;
    reviews: number;
    prep: number;
    open?: boolean;
    description?: string;
    /** The person behind the counter: name, first year here, a line of theirs (ru / uz), photo key. */
    owner?: { name: string; since: number; motto: [ru: string, uz: string]; photo?: string };
  },
): MapStoreDto {
  return {
    id,
    tenantId: TENANT,
    ...stamps,
    vendorId: `vendor-${id}`,
    type,
    status: 'ACTIVE',
    name: { ru, uz, en: ru },
    description: options.description ? { ru: options.description, uz: options.description } : null,
    slug: id,
    logoUrl: null,
    coverUrl: PHOTOS[id] ?? null,
    counterPhotoUrl: null,
    counterPhotoAt: null,
    promotedUntil: null,
    tags: [],
    phone: '+998 71 200 00 00',
    cityId: 'tashkent',
    address: options.address,
    point: { lat: options.point[0], lng: options.point[1] },
    standNumber: options.stand ?? null,
    ownerName: options.owner?.name ?? null,
    ownerSince: options.owner?.since ?? null,
    ownerPhotoUrl: options.owner?.photo ? (PHOTOS[options.owner.photo] ?? null) : null,
    ownerMotto: options.owner ? { ru: options.owner.motto[0], uz: options.owner.motto[1] } : null,
    rating: options.rating,
    reviewCount: options.reviews,
    preparationMinutes: options.prep,
    schedule: [],
    isOpen: options.open ?? true,
  };
}

const STORES: MapStoreDto[] = [
  store('chorsu-zelen', 'Зелёный ряд, Чорсу', 'Chorsu koʻkat rastasi', STORE_TYPE.BAZAAR_STALL, {
    address: 'Базар Чорсу, Олмазор',
    point: [41.3266, 69.2347],
    stand: 'Ряд 4, место 12',
    rating: 4.8,
    reviews: 312,
    prep: 20,
    description: 'Зелень и овощи с утренней поставки. Взвешиваем при вас.',
    owner: {
      name: 'Фарход-ака',
      since: 2011,
      motto: [
        'Зелень режу на рассвете — к обеду её уже нет.',
        'Koʻkatni tongda oʻraman — tushga qolmaydi.',
      ],
    },
  }),
  store(
    'alay-fruits',
    'Фруктовый павильон, Алайский',
    'Aloy meva pavilyoni',
    STORE_TYPE.BAZAAR_STALL,
    {
      address: 'Алайский базар, Мирабад',
      point: [41.312, 69.286],
      stand: 'Павильон Б, место 7',
      rating: 4.6,
      reviews: 189,
      prep: 25,
      description: 'Сезонные фрукты и ягоды, отбор под заказ.',
      owner: {
        name: 'Дилноза-опа',
        since: 2016,
        motto: [
          'Дыню выбираю по хвостику — ещё ни разу не ошиблась.',
          'Qovunni dumidan tanlayman — hali adashganim yoʻq.',
        ],
        photo: 'bundle-fruit',
      },
    },
  ),
  store('farhad-meat', 'Мясная лавка «Фархад»', 'Farhod goʻsht doʻkoni', STORE_TYPE.SHOP, {
    address: 'Фархадский базар, Чиланзар',
    point: [41.283, 69.205],
    stand: 'Мясной корпус, 3',
    rating: 4.9,
    reviews: 421,
    prep: 30,
    description: 'Халяль, разделка по запросу, охлаждённая доставка.',
    owner: {
      name: 'Фархад',
      since: 2008,
      motto: ['Разделываю как для своей семьи.', 'Oʻz oilamga kesgandek kesaman.'],
    },
  }),
  store('makro-yunusabad', 'Makro Юнусабад', 'Makro Yunusobod', STORE_TYPE.SUPERMARKET, {
    address: 'Юнусабад, массив 19',
    point: [41.364, 69.289],
    rating: 4.4,
    reviews: 1204,
    prep: 15,
    description: 'Полный ассортимент супермаркета.',
  }),
  store('non-uyi', 'Нон уйи', 'Non uyi', STORE_TYPE.SHOP, {
    address: 'Чиланзар, квартал 12',
    point: [41.275, 69.203],
    rating: 4.7,
    reviews: 96,
    prep: 10,
    open: false,
    description: 'Тандырный хлеб и выпечка. Открываемся в 06:00.',
  }),
  store('ziravor', 'Лавка специй «Зиравор»', 'Ziravor doʻkoni', STORE_TYPE.ENTREPRENEUR, {
    address: 'Базар Чорсу, купольный зал',
    point: [41.3258, 69.2362],
    stand: 'Ряд специй, 18',
    rating: 4.5,
    reviews: 63,
    prep: 20,
    description: 'Специи на развес, сухофрукты и орехи.',
  }),
];

type ProductSeed = [
  id: string,
  storeId: string,
  categoryId: string,
  ru: string,
  uz: string,
  soum: number,
  unit: ProductDto['unit'],
  extra?: { oldSoum?: number; available?: boolean; stock?: number | null; rating?: number },
];

const PRODUCT_SEEDS: ProductSeed[] = [
  [
    'p-carrot',
    'chorsu-zelen',
    'vegetables',
    'Морковь жёлтая, для плова',
    'Sariq sabzi, palov uchun',
    6500,
    PRODUCT_UNIT.KG,
    { rating: 4.8 },
  ],
  [
    'p-tomato',
    'chorsu-zelen',
    'vegetables',
    'Помидоры бакинские',
    'Boku pomidori',
    18000,
    PRODUCT_UNIT.KG,
    { oldSoum: 22000, rating: 4.7 },
  ],
  [
    'p-cucumber',
    'chorsu-zelen',
    'vegetables',
    'Огурцы грунтовые',
    'Bodring',
    12000,
    PRODUCT_UNIT.KG,
    { rating: 4.5 },
  ],
  [
    'p-greens',
    'chorsu-zelen',
    'vegetables',
    'Зелень, пучок',
    'Koʻkat, bogʻlam',
    4000,
    PRODUCT_UNIT.PCS,
    { rating: 4.9 },
  ],
  [
    'p-potato',
    'chorsu-zelen',
    'vegetables',
    'Картофель',
    'Kartoshka',
    9500,
    PRODUCT_UNIT.KG,
    { rating: 4.3 },
  ],
  [
    'p-onion',
    'chorsu-zelen',
    'vegetables',
    'Лук репчатый',
    'Piyoz',
    7000,
    PRODUCT_UNIT.KG,
    { rating: 4.2 },
  ],

  [
    'p-peach',
    'alay-fruits',
    'fruits',
    'Персики',
    'Shaftoli',
    34000,
    PRODUCT_UNIT.KG,
    { oldSoum: 39000, rating: 4.8 },
  ],
  [
    'p-grape',
    'alay-fruits',
    'fruits',
    'Виноград «Хусайне»',
    'Husayni uzumi',
    28000,
    PRODUCT_UNIT.KG,
    { rating: 4.9 },
  ],
  [
    'p-melon',
    'alay-fruits',
    'fruits',
    'Дыня мирзачульская',
    'Mirzachoʻl qovuni',
    45000,
    PRODUCT_UNIT.PCS,
    { stock: 8, rating: 5 },
  ],
  [
    'p-pomegranate',
    'alay-fruits',
    'fruits',
    'Гранат',
    'Anor',
    32000,
    PRODUCT_UNIT.KG,
    { rating: 4.6 },
  ],

  [
    'p-beef',
    'farhad-meat',
    'meat',
    'Говядина, мякоть',
    'Mol goʻshti',
    115000,
    PRODUCT_UNIT.KG,
    { rating: 4.9 },
  ],
  [
    'p-lamb',
    'farhad-meat',
    'meat',
    'Баранина на кости',
    'Qoʻy goʻshti',
    135000,
    PRODUCT_UNIT.KG,
    { oldSoum: 145000, rating: 4.8 },
  ],
  [
    'p-chicken',
    'farhad-meat',
    'meat',
    'Курица охлаждённая',
    'Tovuq',
    42000,
    PRODUCT_UNIT.KG,
    { rating: 4.4 },
  ],

  [
    'p-milk',
    'makro-yunusabad',
    'dairy',
    'Молоко 3.2%, 1 л',
    'Sut 3.2%',
    13500,
    PRODUCT_UNIT.L,
    { rating: 4.5 },
  ],
  [
    'p-suzma',
    'makro-yunusabad',
    'dairy',
    'Сузьма домашняя',
    'Suzma',
    24000,
    PRODUCT_UNIT.KG,
    { rating: 4.7 },
  ],
  [
    'p-eggs',
    'makro-yunusabad',
    'dairy',
    'Яйца С1, 10 шт',
    'Tuxum C1',
    19000,
    PRODUCT_UNIT.PACK,
    { oldSoum: 21000, rating: 4.3 },
  ],
  [
    'p-rice',
    'makro-yunusabad',
    'grocery',
    'Рис лазер, девзира',
    'Devzira guruch',
    38000,
    PRODUCT_UNIT.KG,
    { rating: 4.8 },
  ],
  [
    'p-oil',
    'makro-yunusabad',
    'grocery',
    'Масло хлопковое, 1 л',
    'Paxta yogʻi',
    26000,
    PRODUCT_UNIT.L,
    { rating: 4.1 },
  ],
  [
    'p-soap',
    'makro-yunusabad',
    'household',
    'Средство для посуды',
    'Idish yuvish vositasi',
    22000,
    PRODUCT_UNIT.PCS,
    { available: false, rating: 4.2 },
  ],

  [
    'p-obi-non',
    'non-uyi',
    'bakery',
    'Обі нон, тандырный',
    'Obi non',
    6000,
    PRODUCT_UNIT.PCS,
    { rating: 4.9 },
  ],
  [
    'p-patir',
    'non-uyi',
    'bakery',
    'Патыр слоёный',
    'Patir',
    9000,
    PRODUCT_UNIT.PCS,
    { rating: 4.8 },
  ],
  [
    'p-samsa',
    'non-uyi',
    'bakery',
    'Самса с мясом',
    'Goʻshtli somsa',
    12000,
    PRODUCT_UNIT.PCS,
    { stock: 24, rating: 4.7 },
  ],

  [
    'p-zira',
    'ziravor',
    'spices',
    'Зира, пакет 100 г',
    'Zira, 100 g paket',
    8000,
    PRODUCT_UNIT.PACK,
    { rating: 4.6 },
  ],
  [
    'p-raisin',
    'ziravor',
    'spices',
    'Изюм чёрный',
    'Qora mayiz',
    42000,
    PRODUCT_UNIT.KG,
    { rating: 4.5 },
  ],
  [
    'p-walnut',
    'ziravor',
    'spices',
    'Грецкий орех, ядро',
    'Yongʻoq magʻzi',
    98000,
    PRODUCT_UNIT.KG,
    { oldSoum: 110000, rating: 4.9 },
  ],
];

const PRODUCTS: ProductDto[] = PRODUCT_SEEDS.map(
  ([id, storeId, categoryId, ru, uz, soum, unit, extra = {}]) => ({
    id,
    tenantId: TENANT,
    arrivedAt: null,
    tags: [],
    ...stamps,
    storeId,
    categoryId,
    name: { ru, uz, en: ru },
    description: null,
    slug: id,
    unit,
    // Money is minor units everywhere: soum -> tiyin.
    price: { amount: soum * 100, currency: 'UZS' },
    oldPrice: extra.oldSoum ? { amount: extra.oldSoum * 100, currency: 'UZS' } : null,
    minQuantity: unit === PRODUCT_UNIT.KG ? 0.5 : 1,
    quantityStep: unit === PRODUCT_UNIT.KG ? 0.5 : 1,
    weightGrams: null,
    images: PHOTOS[id] ? [{ url: PHOTOS[id] }] : [],
    available: extra.available ?? true,
    stock: extra.stock ?? null,
    rating: extra.rating ?? 4.5,
    reviewCount: Math.round((extra.rating ?? 4.5) * 27),
  }),
);

export type ProductSort = 'popular' | 'price-asc' | 'price-desc' | 'rating';

export const PRODUCT_SORTS: ReadonlyArray<{ value: ProductSort; label: string }> = [
  { value: 'popular', label: 'Сначала популярные' },
  { value: 'price-asc', label: 'Сначала дешёвые' },
  { value: 'price-desc', label: 'Сначала дорогие' },
  { value: 'rating', label: 'По рейтингу' },
];

export function isProductSort(value: string | undefined): value is ProductSort {
  return PRODUCT_SORTS.some((sort) => sort.value === value);
}

export async function listCategories(): Promise<CategoryDto[]> {
  const counts = new Map<string, number>();
  for (const product of PRODUCTS) {
    if (!product.categoryId) continue;
    counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
  }
  return CATEGORIES.map((item) => ({ ...item, productCount: counts.get(item.id) ?? 0 }));
}

export async function listStores(
  query: { type?: string; search?: string } = {},
): Promise<MapStoreDto[]> {
  const search = query.search?.trim().toLowerCase();
  return STORES.filter((item) => {
    if (query.type && item.type !== query.type) return false;
    if (search && !Object.values(item.name).join(' ').toLowerCase().includes(search)) return false;
    return true;
  });
}

export async function getStore(id: string): Promise<MapStoreDto | null> {
  return STORES.find((item) => item.id === id) ?? null;
}

export async function listProducts(
  query: { storeId?: string; categoryId?: string; search?: string; sort?: ProductSort } = {},
): Promise<ProductDto[]> {
  const search = query.search?.trim().toLowerCase();

  const found = PRODUCTS.filter((product) => {
    if (query.storeId && product.storeId !== query.storeId) return false;
    if (query.categoryId && product.categoryId !== query.categoryId) return false;
    if (search && !Object.values(product.name).join(' ').toLowerCase().includes(search))
      return false;
    return true;
  });

  switch (query.sort) {
    case 'price-asc':
      return found.sort((a, b) => a.price.amount - b.price.amount);
    case 'price-desc':
      return found.sort((a, b) => b.price.amount - a.price.amount);
    case 'rating':
      return found.sort((a, b) => b.rating - a.rating);
    default:
      // "Popular" without order data: available goods first, then rating.
      return found.sort(
        (a, b) => Number(b.available) - Number(a.available) || b.reviewCount - a.reviewCount,
      );
  }
}
