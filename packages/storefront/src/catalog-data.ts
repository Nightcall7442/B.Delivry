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
import { SHOP_LIMITS } from './shops.js';

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

/** 07:40 Tashkent today: the hour the counters are set out. */
function counterTime(): string {
  const now = new Date();
  const local = new Date(now.getTime() + 5 * 3600_000);
  return `${local.toISOString().slice(0, 10)}T07:40:00+05:00`;
}

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
    /** This morning's photo of the counter (photo key). */
    counter?: string;
    /** Branches of one chain share it. */
    chain?: string;
    /** A shop's logo (photo key); stalls have faces instead. */
    logo?: string;
  },
): MapStoreDto {
  const shop =
    !options.owner && type !== STORE_TYPE.BAZAAR_STALL && type !== STORE_TYPE.ENTREPRENEUR;
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
    logoUrl: options.logo ? (PHOTOS[options.logo] ?? null) : null,
    coverUrl: PHOTOS[id] ?? PHOTOS[options.chain ?? ''] ?? null,
    counterPhotoUrl: options.counter ? (PHOTOS[options.counter] ?? null) : null,
    counterPhotoAt: options.counter ? counterTime() : null,
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
    chainSlug: options.chain ?? null,
    minOrder: shop ? SHOP_LIMITS.minOrder : null,
    freeDeliveryThreshold: shop ? SHOP_LIMITS.freeDeliveryThreshold : null,
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
    counter: 'counter-signs',
    owner: {
      name: 'Фарход-ака',
      since: 2011,
      motto: [
        'Зелень режу на рассвете — к обеду её уже нет.',
        'Koʻkatni tongda oʻraman — tushga qolmaydi.',
      ],
      photo: 'owner-greens',
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
      counter: 'alay-fruits',
      rating: 4.6,
      reviews: 189,
      prep: 25,
      description: 'Сезонные фрукты и ягоды, отбор под заказ.',
      owner: {
        name: 'Дилшод-ака',
        since: 2016,
        motto: [
          'Дыню выбираю по хвостику — ещё ни разу не ошибся.',
          'Qovunni dumidan tanlayman — hali adashganim yoʻq.',
        ],
        photo: 'owner-fruit',
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
      photo: 'owner-meat',
    },
  }),
  store('makro-yunusabad', 'Makro Юнусабад', 'Makro Yunusobod', STORE_TYPE.SUPERMARKET, {
    address: 'Юнусабад, массив 19',
    point: [41.364, 69.289],
    rating: 4.4,
    reviews: 1204,
    prep: 15,
    description: 'Полный ассортимент супермаркета.',
    chain: 'makro',
  }),
  // A chain: two branches behind one shopfront, the nearer one takes the order.
  store('korzinka-yunusabad', 'Korzinka Юнусабад', 'Korzinka Yunusobod', STORE_TYPE.SUPERMARKET, {
    address: 'Юнусабад, 4-квартал, ул. Бабура',
    point: [41.357, 69.291],
    rating: 4.5,
    reviews: 2310,
    prep: 20,
    description: 'Продукты на каждый день: молочное, бакалея, вода, бытовая химия.',
    chain: 'korzinka',
  }),
  store('korzinka-chilanzar', 'Korzinka Чиланзар', 'Korzinka Chilonzor', STORE_TYPE.SUPERMARKET, {
    address: 'Чиланзар, квартал 2, ул. Мукими',
    point: [41.283, 69.208],
    rating: 4.5,
    reviews: 1875,
    prep: 20,
    description: 'Продукты на каждый день: молочное, бакалея, вода, бытовая химия.',
    chain: 'korzinka',
  }),
  // The corner shop: no chain, no counter person — a shelf that is open late.
  store(
    'lavka-yunusabad-4',
    'Продукты у дома, Юнусабад-4',
    'Uy oldidagi doʻkon, Yunusobod-4',
    STORE_TYPE.SHOP,
    {
      address: 'Юнусабад, 4-квартал, дом 15',
      point: [41.3565, 69.2885],
      rating: 4.3,
      reviews: 164,
      prep: 10,
      description: 'Хлеб, молоко, яйца и всё, что кончилось дома в одиннадцать вечера.',
    },
  ),
  store('non-uyi', 'Нон уйи', 'Non uyi', STORE_TYPE.SHOP, {
    address: 'Чиланзар, квартал 12',
    point: [41.275, 69.203],
    rating: 4.7,
    reviews: 96,
    prep: 10,
    open: false,
    stand: 'У входа, тандыр',
    description: 'Тандырный хлеб и выпечка. Открываемся в 06:00.',
    counter: 'owner-tandoor',
    owner: {
      name: 'Мунира-опа',
      since: 2009,
      motto: [
        'Тандыр горячий с шести. Оби нон — до десяти, патир по пятницам.',
        'Tandir oltidan qizigan. Obi non — oʻngacha, patir juma kuni.',
      ],
      photo: 'owner-tandoor',
    },
  }),
  store('ziravor', 'Лавка специй «Зиравор»', 'Ziravor doʻkoni', STORE_TYPE.ENTREPRENEUR, {
    address: 'Базар Чорсу, купольный зал',
    point: [41.3258, 69.2362],
    stand: 'Ряд специй, 18',
    rating: 4.5,
    reviews: 63,
    prep: 20,
    description: 'Специи на развес, сухофрукты и орехи.',
    counter: 'owner-spices',
    owner: {
      name: 'Рустам-ака',
      since: 2014,
      motto: [
        'Зиру для плова беру только из Ферганы.',
        'Palov uchun zirani faqat Fargʻonadan olaman.',
      ],
      photo: 'owner-spices',
    },
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
  extra?: {
    oldSoum?: number;
    available?: boolean;
    stock?: number | null;
    rating?: number;
    say?: [ru: string, uz: string];
    /** Photo key when it is not the product id (shop shelves share photographs). */
    photo?: string;
    /** Grams per unit: past 15 kg an order rides in a car. */
    weight?: number;
  },
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
    {
      rating: 4.8,
      say: ['Жёлтая — для плова, другой не беру', 'Sariq — palov uchun, boshqasini olmayman'],
    },
  ],
  [
    'p-tomato',
    'chorsu-zelen',
    'vegetables',
    'Помидоры бакинские',
    'Boku pomidori',
    18000,
    PRODUCT_UNIT.KG,
    {
      oldSoum: 22000,
      rating: 4.7,
      say: ['Бакинские, с куста — режьте с солью', 'Bokulik, tupdan — tuz bilan kesing'],
    },
  ],
  [
    'p-cucumber',
    'chorsu-zelen',
    'vegetables',
    'Огурцы грунтовые',
    'Bodring',
    12000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.5,
      say: ['Грунтовые, колючие — значит настоящие', 'Ochiq yerdan, tikanli — demak haqiqiy'],
    },
  ],
  [
    'p-greens',
    'chorsu-zelen',
    'vegetables',
    'Зелень, пучок',
    'Koʻkat, bogʻlam',
    4000,
    PRODUCT_UNIT.PCS,
    {
      rating: 4.9,
      say: ['Режу на рассвете, к обеду уже не та', 'Tongda oʻraman, tushga qolsa u emas'],
    },
  ],
  [
    'p-potato',
    'chorsu-zelen',
    'vegetables',
    'Картофель',
    'Kartoshka',
    9500,
    PRODUCT_UNIT.KG,
    { rating: 4.3, say: ['Из Самарканда, на жарёшку самый', 'Samarqanddan, qovurishga eng zoʻri'] },
  ],
  [
    'p-onion',
    'chorsu-zelen',
    'vegetables',
    'Лук репчатый',
    'Piyoz',
    7000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.2,
      say: ['Сладкий, для салата — не заплачете', 'Shirin, salat uchun — yigʻlamaysiz'],
    },
  ],

  [
    'p-peach',
    'alay-fruits',
    'fruits',
    'Персики',
    'Shaftoli',
    34000,
    PRODUCT_UNIT.KG,
    { oldSoum: 39000, rating: 4.8, say: ['Наливные, ешьте сегодня', 'Suvli, bugun yeng'] },
  ],
  [
    'p-grape',
    'alay-fruits',
    'fruits',
    'Виноград «Хусайне»',
    'Husayni uzumi',
    28000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.9,
      say: ['Хусайне — дамские пальчики, косточки нет', 'Husayni — xonim barmoqlari, danagi yoʻq'],
    },
  ],
  [
    'p-melon',
    'alay-fruits',
    'fruits',
    'Дыня мирзачульская',
    'Mirzachoʻl qovuni',
    45000,
    PRODUCT_UNIT.PCS,
    {
      stock: 8,
      rating: 5,
      say: ['Выбираю по хвостику — ещё ни разу не ошибся', 'Dumidan tanlayman — hali adashmadim'],
    },
  ],
  [
    'p-pomegranate',
    'alay-fruits',
    'fruits',
    'Гранат',
    'Anor',
    32000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.6,
      say: ['Тяжёлый — значит сочный, лёгкий не беру', 'Ogʻiri — sersuv, yengilini olmayman'],
    },
  ],

  [
    'p-beef',
    'farhad-meat',
    'meat',
    'Говядина, мякоть',
    'Mol goʻshti',
    115000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.9,
      say: ['Мякоть с утра — на шурпу и на стейк', 'Ertalabki goʻsht — shoʻrva va steyk uchun'],
    },
  ],
  [
    'p-lamb',
    'farhad-meat',
    'meat',
    'Баранина на кости',
    'Qoʻy goʻshti',
    135000,
    PRODUCT_UNIT.KG,
    {
      oldSoum: 145000,
      rating: 4.8,
      say: [
        'На кости — для шурпы, разделываю при вас',
        'Suyakli — shoʻrvaga, koʻz oldingizda boʻlaman',
      ],
    },
  ],
  [
    'p-chicken',
    'farhad-meat',
    'meat',
    'Курица охлаждённая',
    'Tovuq',
    42000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.4,
      say: ['Домашняя, охлаждённая, не заморозка', 'Uy tovugʻi, sovutilgan, muzlatilmagan'],
    },
  ],

  [
    'p-milk',
    'makro-yunusabad',
    'dairy',
    'Молоко 3.2%, 1 л',
    'Sut 3.2%',
    13500,
    PRODUCT_UNIT.L,
    { rating: 4.5, say: ['Пастеризованное, 3,2 %, до пятницы', 'Pasterlangan, 3,2 %, jumagacha'] },
  ],
  [
    'p-suzma',
    'makro-yunusabad',
    'dairy',
    'Сузьма домашняя',
    'Suzma',
    24000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.7,
      say: ['Домашняя, густая — на ложке стоит', 'Uy suzmasi, quyuq — qoshiqda turadi'],
    },
  ],
  [
    'p-eggs',
    'makro-yunusabad',
    'dairy',
    'Яйца С1, 10 шт',
    'Tuxum C1',
    19000,
    PRODUCT_UNIT.PACK,
    { oldSoum: 21000, rating: 4.3, say: ['С1, десяток, сегодняшние', 'C1, oʻntalik, bugungi'] },
  ],
  [
    'p-rice',
    'makro-yunusabad',
    'grocery',
    'Рис лазер, девзира',
    'Devzira guruch',
    38000,
    PRODUCT_UNIT.KG,
    {
      rating: 4.8,
      say: ['Девзира — для плова, промыть семь раз', 'Devzira — palov uchun, yetti marta yuving'],
    },
  ],
  [
    'p-oil',
    'makro-yunusabad',
    'grocery',
    'Масло хлопковое, 1 л',
    'Paxta yogʻi',
    26000,
    PRODUCT_UNIT.L,
    { rating: 4.1, say: ['Хлопковое — на плов только оно', 'Paxta yogʻi — palovga faqat shu'] },
  ],
  [
    'p-soap',
    'makro-yunusabad',
    'household',
    'Средство для посуды',
    'Idish yuvish vositasi',
    22000,
    PRODUCT_UNIT.PCS,
    { available: false, rating: 4.2, say: ['Хозяйственное, 72 %', 'Xoʻjalik sovuni, 72 %'] },
  ],

  [
    'p-obi-non',
    'non-uyi',
    'bakery',
    'Обі нон, тандырный',
    'Obi non',
    6000,
    PRODUCT_UNIT.PCS,
    { rating: 4.9, say: ['Из тандыра с рассвета, ещё горячий', 'Tongdan tandirdan, hali issiq'] },
  ],
  [
    'p-patir',
    'non-uyi',
    'bakery',
    'Патыр слоёный',
    'Patir',
    9000,
    PRODUCT_UNIT.PCS,
    { rating: 4.8, say: ['Слоёный, на масле — к чаю', 'Qatlama, yogʻli — choyga'] },
  ],
  [
    'p-samsa',
    'non-uyi',
    'bakery',
    'Самса с мясом',
    'Goʻshtli somsa',
    12000,
    PRODUCT_UNIT.PCS,
    {
      stock: 24,
      rating: 4.7,
      say: ['С мясом и луком, сок внутри', 'Goʻsht va piyozli, ichida shoʻrvasi'],
    },
  ],

  [
    'p-milk-kz1',
    'korzinka-yunusabad',
    'dairy',
    'Молоко 3.2%, 1 л',
    'Sut 3.2%, 1 l',
    12500,
    PRODUCT_UNIT.PCS,
    { rating: 4.6, stock: 40, photo: 'p-milk', weight: 1050 },
  ],
  [
    'p-eggs-kz1',
    'korzinka-yunusabad',
    'dairy',
    'Яйца С1, 10 шт',
    'Tuxum C1, 10 dona',
    19000,
    PRODUCT_UNIT.PCS,
    { rating: 4.5, stock: 60, photo: 'p-eggs', weight: 650 },
  ],
  [
    'p-rice-kz1',
    'korzinka-yunusabad',
    'grocery',
    'Рис лазер, 1 кг',
    'Lazer guruch, 1 kg',
    36000,
    PRODUCT_UNIT.PCS,
    { rating: 4.4, stock: 25, photo: 'p-rice', weight: 1000 },
  ],
  [
    'p-flour-kz1',
    'korzinka-yunusabad',
    'grocery',
    'Мука в/с, мешок 25 кг',
    'Un oliy nav, 25 kg qop',
    185000,
    PRODUCT_UNIT.PCS,
    { rating: 4.7, stock: 8, photo: 'p-rice', weight: 25000 },
  ],
  [
    'p-oil-kz1',
    'korzinka-yunusabad',
    'grocery',
    'Масло подсолнечное, 1 л',
    'Kungaboqar yogʻi, 1 l',
    24000,
    PRODUCT_UNIT.PCS,
    { oldSoum: 27000, rating: 4.3, stock: 30, photo: 'p-oil', weight: 950 },
  ],
  [
    'p-water-kz1',
    'korzinka-yunusabad',
    'grocery',
    'Вода питьевая, 19 л',
    'Ichimlik suvi, 19 l',
    32000,
    PRODUCT_UNIT.PCS,
    { rating: 4.6, stock: 12, photo: 'p-oil', weight: 19500 },
  ],
  [
    'p-bread-kz1',
    'korzinka-yunusabad',
    'bakery',
    'Хлеб пшеничный, буханка',
    'Bugʻdoy noni',
    6000,
    PRODUCT_UNIT.PCS,
    { rating: 4.2, stock: 20, photo: 'p-patir', weight: 500 },
  ],
  [
    'p-soap-kz1',
    'korzinka-yunusabad',
    'household',
    'Средство для посуды, 500 мл',
    'Idish yuvish vositasi, 500 ml',
    14500,
    PRODUCT_UNIT.PCS,
    { rating: 4.4, stock: 35, photo: 'p-soap', weight: 550 },
  ],
  [
    'p-milk-kz2',
    'korzinka-chilanzar',
    'dairy',
    'Молоко 3.2%, 1 л',
    'Sut 3.2%, 1 l',
    12500,
    PRODUCT_UNIT.PCS,
    { rating: 4.6, stock: 40, photo: 'p-milk', weight: 1050 },
  ],
  [
    'p-eggs-kz2',
    'korzinka-chilanzar',
    'dairy',
    'Яйца С1, 10 шт',
    'Tuxum C1, 10 dona',
    19000,
    PRODUCT_UNIT.PCS,
    { rating: 4.5, stock: 60, photo: 'p-eggs', weight: 650 },
  ],
  [
    'p-rice-kz2',
    'korzinka-chilanzar',
    'grocery',
    'Рис лазер, 1 кг',
    'Lazer guruch, 1 kg',
    36000,
    PRODUCT_UNIT.PCS,
    { rating: 4.4, stock: 25, photo: 'p-rice', weight: 1000 },
  ],
  [
    'p-flour-kz2',
    'korzinka-chilanzar',
    'grocery',
    'Мука в/с, мешок 25 кг',
    'Un oliy nav, 25 kg qop',
    185000,
    PRODUCT_UNIT.PCS,
    { rating: 4.7, stock: 8, photo: 'p-rice', weight: 25000 },
  ],
  [
    'p-oil-kz2',
    'korzinka-chilanzar',
    'grocery',
    'Масло подсолнечное, 1 л',
    'Kungaboqar yogʻi, 1 l',
    24000,
    PRODUCT_UNIT.PCS,
    { oldSoum: 27000, rating: 4.3, stock: 30, photo: 'p-oil', weight: 950 },
  ],
  [
    'p-water-kz2',
    'korzinka-chilanzar',
    'grocery',
    'Вода питьевая, 19 л',
    'Ichimlik suvi, 19 l',
    32000,
    PRODUCT_UNIT.PCS,
    { rating: 4.6, stock: 12, photo: 'p-oil', weight: 19500 },
  ],
  [
    'p-bread-kz2',
    'korzinka-chilanzar',
    'bakery',
    'Хлеб пшеничный, буханка',
    'Bugʻdoy noni',
    6000,
    PRODUCT_UNIT.PCS,
    { rating: 4.2, stock: 20, photo: 'p-patir', weight: 500 },
  ],
  [
    'p-soap-kz2',
    'korzinka-chilanzar',
    'household',
    'Средство для посуды, 500 мл',
    'Idish yuvish vositasi, 500 ml',
    14500,
    PRODUCT_UNIT.PCS,
    { rating: 4.4, stock: 35, photo: 'p-soap', weight: 550 },
  ],
  [
    'p-milk-lv',
    'lavka-yunusabad-4',
    'dairy',
    'Молоко 3.2%, 1 л',
    'Sut 3.2%, 1 l',
    13000,
    PRODUCT_UNIT.PCS,
    { rating: 4.4, stock: 12, photo: 'p-milk', weight: 1050 },
  ],
  [
    'p-eggs-lv',
    'lavka-yunusabad-4',
    'dairy',
    'Яйца С1, 10 шт',
    'Tuxum C1, 10 dona',
    20000,
    PRODUCT_UNIT.PCS,
    { rating: 4.3, stock: 15, photo: 'p-eggs', weight: 650 },
  ],
  [
    'p-bread-lv',
    'lavka-yunusabad-4',
    'bakery',
    'Лепёшка домашняя',
    'Uy noni',
    5000,
    PRODUCT_UNIT.PCS,
    { rating: 4.6, stock: 10, photo: 'p-obi-non', weight: 400 },
  ],
  [
    'p-oil-lv',
    'lavka-yunusabad-4',
    'grocery',
    'Масло подсолнечное, 1 л',
    'Kungaboqar yogʻi, 1 l',
    25000,
    PRODUCT_UNIT.PCS,
    { rating: 4.2, stock: 8, photo: 'p-oil', weight: 950 },
  ],
  [
    'p-zira',
    'ziravor',
    'spices',
    'Зира, пакет 100 г',
    'Zira, 100 g paket',
    8000,
    PRODUCT_UNIT.PACK,
    {
      rating: 4.6,
      say: ['Горная — разотрите в ладони, пахнет', 'Togʻ zirasi — kaftda ishqang, hidi keladi'],
    },
  ],
  [
    'p-raisin',
    'ziravor',
    'spices',
    'Изюм чёрный',
    'Qora mayiz',
    42000,
    PRODUCT_UNIT.KG,
    { rating: 4.5, say: ['Чёрный, без косточек — для плова', 'Qora, danaksiz — palovga'] },
  ],
  [
    'p-walnut',
    'ziravor',
    'spices',
    'Грецкий орех, ядро',
    'Yongʻoq magʻzi',
    98000,
    PRODUCT_UNIT.KG,
    { oldSoum: 110000, rating: 4.9, say: ['Ядро светлое, этого года', 'Magʻzi oq, shu yilgi'] },
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
    // The vendor's own line about it — what they would say handing it to you.
    description: extra.say ? { ru: extra.say[0], uz: extra.say[1], en: extra.say[0] } : null,
    slug: id,
    unit,
    // Money is minor units everywhere: soum -> tiyin.
    price: { amount: soum * 100, currency: 'UZS' },
    oldPrice: extra.oldSoum ? { amount: extra.oldSoum * 100, currency: 'UZS' } : null,
    minQuantity: unit === PRODUCT_UNIT.KG ? 0.5 : 1,
    quantityStep: unit === PRODUCT_UNIT.KG ? 0.5 : 1,
    weightGrams: extra.weight ?? null,
    images: PHOTOS[extra.photo ?? id] ? [{ url: PHOTOS[extra.photo ?? id]! }] : [],
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
