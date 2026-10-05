/**
 * Database seed entrypoint.
 *
 * Reference data ONLY: the tenant, the geography of Uzbekistan, the categories
 * and a starting tariff. No users, no stores, no orders — a seed that invents
 * people makes a staging database indistinguishable from a real one.
 *
 * Every write is an upsert keyed on a natural code, so running this twice
 * changes nothing.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { SALE } from '@bazar/constants';
import { listProducts, listStores, HOURS, isShopfront } from '@bazar/storefront';

const prisma = new PrismaClient();

/** ISO 3166-2:UZ subdivisions, with their administrative centres. */
const REGIONS: { code: string; uz: string; ru: string; en: string; city: string }[] = [
  {
    code: 'UZ-TK',
    uz: 'Toshkent shahri',
    ru: 'город Ташкент',
    en: 'Tashkent City',
    city: 'Toshkent',
  },
  {
    code: 'UZ-TO',
    uz: 'Toshkent viloyati',
    ru: 'Ташкентская область',
    en: 'Tashkent Region',
    city: 'Nurafshon',
  },
  {
    code: 'UZ-AN',
    uz: 'Andijon',
    ru: 'Андижанская область',
    en: 'Andijan Region',
    city: 'Andijon',
  },
  { code: 'UZ-BU', uz: 'Buxoro', ru: 'Бухарская область', en: 'Bukhara Region', city: 'Buxoro' },
  { code: 'UZ-FA', uz: 'Fargona', ru: 'Ферганская область', en: 'Fergana Region', city: 'Fargona' },
  { code: 'UZ-JI', uz: 'Jizzax', ru: 'Джизакская область', en: 'Jizzakh Region', city: 'Jizzax' },
  { code: 'UZ-XO', uz: 'Xorazm', ru: 'Хорезмская область', en: 'Khorezm Region', city: 'Urganch' },
  {
    code: 'UZ-NG',
    uz: 'Namangan',
    ru: 'Наманганская область',
    en: 'Namangan Region',
    city: 'Namangan',
  },
  { code: 'UZ-NW', uz: 'Navoiy', ru: 'Навоийская область', en: 'Navoiy Region', city: 'Navoiy' },
  {
    code: 'UZ-QA',
    uz: 'Qashqadaryo',
    ru: 'Кашкадарьинская область',
    en: 'Kashkadarya Region',
    city: 'Qarshi',
  },
  {
    code: 'UZ-QR',
    uz: 'Qoraqalpogiston',
    ru: 'Каракалпакстан',
    en: 'Karakalpakstan',
    city: 'Nukus',
  },
  {
    code: 'UZ-SA',
    uz: 'Samarqand',
    ru: 'Самаркандская область',
    en: 'Samarkand Region',
    city: 'Samarqand',
  },
  {
    code: 'UZ-SI',
    uz: 'Sirdaryo',
    ru: 'Сырдарьинская область',
    en: 'Syrdarya Region',
    city: 'Guliston',
  },
  {
    code: 'UZ-SU',
    uz: 'Surxondaryo',
    ru: 'Сурхандарьинская область',
    en: 'Surkhandarya Region',
    city: 'Termiz',
  },
];

/**
 * Top-level catalogue. Slugs are the ids the storefront fixtures use for
 * `categoryId`, so products seed by slug without a lookup table.
 */
const CATEGORIES: { slug: string; uz: string; ru: string; en: string }[] = [
  {
    slug: 'vegetables',
    uz: 'Sabzavot va koʻkatlar',
    ru: 'Овощи и зелень',
    en: 'Vegetables & greens',
  },
  { slug: 'fruits', uz: 'Mevalar', ru: 'Фрукты и ягоды', en: 'Fruits & berries' },
  { slug: 'meat', uz: 'Goʻsht va parranda', ru: 'Мясо и птица', en: 'Meat & poultry' },
  { slug: 'dairy', uz: 'Sut mahsulotlari', ru: 'Молочное и яйца', en: 'Dairy & eggs' },
  { slug: 'bakery', uz: 'Non va pishiriqlar', ru: 'Хлеб и выпечка', en: 'Bakery' },
  { slug: 'grocery', uz: 'Baqqollik', ru: 'Бакалея', en: 'Grocery' },
  { slug: 'spices', uz: 'Ziravorlar', ru: 'Специи и сухофрукты', en: 'Spices & dried fruit' },
  { slug: 'household', uz: 'Maishiy', ru: 'Бытовое', en: 'Household' },
];

async function seedTenant(): Promise<string> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'bazar' },
    create: {
      slug: 'bazar',
      name: 'Bazar Delivery',
      defaultLocale: 'uz',
      supportedLocales: ['uz', 'ru', 'en'],
      currency: 'UZS',
      timezone: 'Asia/Tashkent',
    },
    update: {},
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id },
    update: {},
  });

  return tenant.id;
}

/**
 * Regions first, then their administrative centres as cities beneath them.
 * Keyed on (level, code), so re-running only fills in what is missing.
 */
async function seedGeography(): Promise<number> {
  let count = 0;

  for (const region of REGIONS) {
    const parent = await prisma.geoPlace.upsert({
      where: { level_code: { level: 'REGION', code: region.code } },
      create: {
        level: 'REGION',
        code: region.code,
        name: { uz: region.uz, ru: region.ru, en: region.en },
      },
      update: {},
    });

    await prisma.geoPlace.upsert({
      where: { level_code: { level: 'CITY', code: `${region.code}-C` } },
      create: {
        level: 'CITY',
        code: `${region.code}-C`,
        name: { uz: region.city, ru: region.city, en: region.city },
        parentId: parent.id,
      },
      update: {},
    });

    count += 2;
  }

  return count;
}

async function seedCategories(): Promise<number> {
  // Categories that left the list and never got a product are leftovers of an
  // earlier seed, not data: drop them so the storefront chips stay honest.
  await prisma.category.deleteMany({
    where: { slug: { notIn: CATEGORIES.map((c) => c.slug) }, products: { none: {} } },
  });

  for (const [index, category] of CATEGORIES.entries()) {
    const created = await prisma.category.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        name: { uz: category.uz, ru: category.ru, en: category.en },
        // Placeholder; the real path is the row's own id, set just below.
        path: category.slug,
        depth: 0,
        sortOrder: index,
      },
      update: { name: { uz: category.uz, ru: category.ru, en: category.en }, sortOrder: index },
    });

    // The materialized path is the id chain, and the id only exists after the
    // insert, so it is written back here.
    if (created.path !== created.id) {
      await prisma.category.update({ where: { id: created.id }, data: { path: created.id } });
    }
  }

  return CATEGORIES.length;
}

/**
 * One starting tariff so the platform can price an order the moment it has a
 * store and a zone. Amounts are in tiyin: 8000.00 soum base, 1500.00 per km.
 */
async function seedTariff(): Promise<void> {
  const existing = await prisma.tariff.findFirst({ where: { cityId: null } });
  if (existing !== null) return;

  await prisma.tariff.create({
    data: {
      name: 'Default',
      base: 8_000_00,
      perKm: 1_500_00,
      freeDistanceMeters: 1_000,
      minFee: 8_000_00,
      maxFee: 50_000_00,
      commissionPercent: 10,
      serviceFee: 1_000_00,
      freeDeliveryThreshold: 200_000_00,
      minOrder: 20_000_00,
      currency: 'UZS',
    },
  });
}

/**
 * The demo marketplace: one vendor account, the six stalls and shops the
 * storefront fixtures describe, their photos and 24 products. Keyed on slugs,
 * so re-running refreshes prices and photos instead of duplicating rows.
 */
async function seedStorefront(tenantId: string): Promise<{ stores: number; products: number }> {
  const city = await prisma.geoPlace.findUniqueOrThrow({
    where: { level_code: { level: 'CITY', code: 'UZ-TK-C' } },
  });

  const vendorPhone = '+998710000001';
  const user = await prisma.user.upsert({
    where: { tenantId_phone: { tenantId, phone: vendorPhone } },
    create: {
      tenantId,
      phone: vendorPhone,
      firstName: 'Фарход',
      lastName: 'Каримов',
      locale: 'ru',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      roles: { create: { role: 'VENDOR' } },
    },
    update: { firstName: 'Фарход', lastName: 'Каримов' },
  });
  const vendor = await prisma.vendor.upsert({
    where: { userId: user.id },
    create: {
      tenantId,
      userId: user.id,
      legalName: 'ИП Каримов Ф. Р.',
      displayName: 'Прилавки Чорсу',
      phone: vendorPhone,
      status: 'ACTIVE',
      verifiedAt: new Date(),
    },
    update: {},
  });

  const categories = new Map(
    (
      await prisma.category.findMany({ where: { slug: { in: CATEGORIES.map((c) => c.slug) } } })
    ).map((c) => [c.slug, c.id]),
  );

  const stores = await listStores();
  const products = await listProducts();
  const storeIds = new Map<string, string>();

  for (const store of stores) {
    const row = await prisma.store.upsert({
      where: { tenantId_slug: { tenantId, slug: store.slug } },
      create: {
        tenantId,
        vendorId: vendor.id,
        cityId: city.id,
        type: store.type,
        status: 'ACTIVE',
        slug: store.slug,
        name: store.name,
        description: store.description ?? Prisma.JsonNull,
        coverUrl: store.coverUrl,
        phone: store.phone,
        address: store.address,
        lat: store.point.lat,
        lng: store.point.lng,
        standNumber: store.standNumber,
        ownerName: store.ownerName,
        ownerSince: store.ownerSince,
        ownerPhotoUrl: store.ownerPhotoUrl,
        counterPhotoUrl: store.counterPhotoUrl,
        counterPhotoAt: store.counterPhotoAt ? new Date(store.counterPhotoAt) : null,
        ownerMotto: store.ownerMotto ?? Prisma.JsonNull,
        chainSlug: store.chainSlug,
        minOrder: store.minOrder,
        freeDeliveryThreshold: store.freeDeliveryThreshold,
        logoUrl: store.logoUrl,
        rating: store.rating,
        reviewCount: store.reviewCount,
        preparationMinutes: store.preparationMinutes,
      },
      update: {
        chainSlug: store.chainSlug,
        minOrder: store.minOrder,
        freeDeliveryThreshold: store.freeDeliveryThreshold,
        logoUrl: store.logoUrl,
        name: store.name,
        description: store.description ?? Prisma.JsonNull,
        coverUrl: store.coverUrl,
        ownerName: store.ownerName,
        ownerSince: store.ownerSince,
        ownerPhotoUrl: store.ownerPhotoUrl,
        counterPhotoUrl: store.counterPhotoUrl,
        counterPhotoAt: store.counterPhotoAt ? new Date(store.counterPhotoAt) : null,
        ownerMotto: store.ownerMotto ?? Prisma.JsonNull,
        lat: store.point.lat,
        lng: store.point.lng,
        rating: store.rating,
        reviewCount: store.reviewCount,
        preparationMinutes: store.preparationMinutes,
      },
    });
    storeIds.set(store.id, row.id);

    // Rows open at dawn and close at six, shops trade till eleven; the tandyr bakery only
    // mornings, so one store is visibly closed for most of the day.
    const hours = isShopfront(store) ? HOURS.shop : HOURS.stall;
    const closesAt = store.slug === 'non-uyi' ? 12 * 60 : hours.closesAt;
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await prisma.storeSchedule.upsert({
        where: { storeId_weekday: { storeId: row.id, weekday } },
        create: { storeId: row.id, weekday, opensAt: hours.opensAt, closesAt },
        update: { opensAt: hours.opensAt, closesAt },
      });
    }
  }

  for (const product of products) {
    const storeId = storeIds.get(product.storeId);
    if (!storeId) continue;
    const categoryId = product.categoryId ? (categories.get(product.categoryId) ?? null) : null;
    const data = {
      categoryId,
      name: product.name,
      description: product.description ?? Prisma.JsonNull,
      unit: product.unit,
      price: product.price.amount,
      oldPrice: product.oldPrice?.amount ?? null,
      currency: product.price.currency,
      minQuantity: product.minQuantity,
      quantityStep: product.quantityStep,
      available: product.available,
      stock: product.stock,
      weightGrams: product.weightGrams,
      rating: product.rating,
      reviewCount: product.reviewCount,
    };
    const row = await prisma.product.upsert({
      where: { storeId_slug: { storeId, slug: product.slug } },
      create: { tenantId, storeId, slug: product.slug, ...data },
      update: data,
    });
    // «Честная скидка»: a seeded sale is a real one — the old price stood yesterday, the cut is
    // today — so the hourly sweep does not end it before the week is out. Re-seeding after a week
    // starts it afresh.
    if (product.oldPrice) {
      const weekAgo = new Date(Date.now() - SALE.REFERENCE_DAYS * 86_400_000);
      const recent = await prisma.productPrice.count({
        where: { productId: row.id, validFrom: { gte: weekAgo } },
      });
      if (recent === 0) {
        await prisma.productPrice.createMany({
          data: [
            {
              productId: row.id,
              price: product.oldPrice.amount,
              currency: product.price.currency,
              validFrom: new Date(Date.now() - 86_400_000),
            },
            { productId: row.id, price: product.price.amount, currency: product.price.currency },
          ],
        });
      }
    }
    await prisma.productImage.deleteMany({ where: { productId: row.id } });
    if (product.images.length > 0) {
      await prisma.productImage.createMany({
        data: product.images.map((image, sortOrder) => ({
          productId: row.id,
          url: image.url,
          sortOrder,
        })),
      });
    }
  }

  return { stores: stores.length, products: products.length };
}

/**
 * One delivery zone: a box around Tashkent inside the ring road, on the default
 * tariff. Without a zone every address is "outside every delivery zone" and
 * nothing can be quoted.
 */
async function seedZone(): Promise<void> {
  const city = await prisma.geoPlace.findUniqueOrThrow({
    where: { level_code: { level: 'CITY', code: 'UZ-TK-C' } },
  });
  const tariff = await prisma.tariff.findFirstOrThrow({ where: { cityId: null } });
  const existing = await prisma.deliveryZone.findFirst({
    where: { cityId: city.id, name: 'Tashkent' },
  });
  if (existing !== null) return;

  await prisma.deliveryZone.create({
    data: {
      name: 'Tashkent',
      cityId: city.id,
      tariffId: tariff.id,
      // GeoJSON ring, [lng, lat]: roughly the area inside the ring road.
      polygon: [
        [
          [69.13, 41.2],
          [69.42, 41.2],
          [69.42, 41.4],
          [69.13, 41.4],
          [69.13, 41.2],
        ],
      ],
      priority: 0,
      active: true,
    },
  });
}

/**
 * One stall of Urgench's dehkan bazaar. Each is modelled on the Tashkent stall of the same trade:
 * its photographs and the face behind the counter come from that one, the goods are its fixtures
 * (under Khorezm's names where the trade has them), while the owner, the number and the words are
 * Urgench's own.
 */
interface UrganchStall {
  slug: string;
  /** The Tashkent fixture store it is modelled on. */
  from: string;
  name: { ru: string; uz: string; en: string };
  stand: string;
  ownerName: string;
  ownerSince: number;
  ownerMotto: { ru: string; uz: string };
  point: { lat: number; lng: number };
  goods: [id: string, rename?: { ru: string; uz: string; en: string }][];
}

const KHOREZM_MELON = { ru: 'Дыня хорезмская', uz: 'Xorazm qovuni', en: 'Khorezm melon' };

/** Around the dehkan bazaar (41.5513, 60.6317), a few hundred metres between the rows. */
const URGANCH_STALLS: UrganchStall[] = [
  {
    slug: 'urganch-test',
    from: 'chorsu-zelen',
    name: {
      ru: 'Тестовый прилавок, Ургенч',
      uz: 'Sinov rastasi, Urganch',
      en: 'Test stall, Urgench',
    },
    stand: 'Т-1',
    ownerName: 'Азиз-ака · тест',
    ownerSince: 2026,
    ownerMotto: {
      ru: 'Проверочный прилавок — заказы отсюда тестовые',
      uz: 'Sinov rastasi — bu yerdan buyurtmalar sinov uchun',
    },
    point: { lat: 41.5513, lng: 60.6317 },
    goods: [
      ['p-melon', KHOREZM_MELON],
      ['p-greens'],
      ['p-tomato'],
      ['p-potato'],
      ['p-grape'],
      ['p-pomegranate'],
    ],
  },
  {
    slug: 'urganch-fruit',
    from: 'alay-fruits',
    name: { ru: 'Фруктовый ряд, Ургенч', uz: 'Urganch meva rastasi', en: 'Fruit row, Urgench' },
    stand: 'Ряд 2, место 5',
    ownerName: 'Бахтиёр-ака',
    ownerSince: 2015,
    ownerMotto: {
      ru: 'Хорезмскую дыню беру у своих — сладкая до самой корки.',
      uz: 'Xorazm qovunini oʻzimizniklardan olaman — poʻstigacha shirin.',
    },
    point: { lat: 41.5518, lng: 60.6323 },
    goods: [['p-melon', KHOREZM_MELON], ['p-grape'], ['p-pomegranate'], ['p-peach']],
  },
  {
    slug: 'urganch-meat',
    from: 'farhad-meat',
    name: { ru: 'Мясной ряд, Ургенч', uz: 'Urganch goʻsht rastasi', en: 'Meat row, Urgench' },
    stand: 'Мясной ряд, 3',
    ownerName: 'Рахим-ака',
    ownerSince: 2012,
    ownerMotto: {
      ru: 'Мясо привозим с утра, режем при вас.',
      uz: 'Goʻshtni ertalab olib kelamiz, koʻz oldingizda kesamiz.',
    },
    point: { lat: 41.5509, lng: 60.6311 },
    goods: [['p-beef'], ['p-lamb'], ['p-chicken']],
  },
  {
    slug: 'urganch-bread',
    from: 'non-uyi',
    name: { ru: 'Тандыр-нон, Ургенч', uz: 'Urganch tandir noni', en: 'Tandoor bread, Urgench' },
    stand: 'У входа, тандыр',
    ownerName: 'Мукаррам-опа',
    ownerSince: 2010,
    ownerMotto: {
      ru: 'Хлеб из тандыра — горячий, пока не остыл.',
      uz: 'Tandir noni — sovumasdan issiq.',
    },
    point: { lat: 41.5521, lng: 60.6316 },
    goods: [['p-obi-non'], ['p-patir'], ['p-samsa']],
  },
  {
    slug: 'urganch-spices',
    from: 'ziravor',
    name: { ru: 'Лавка специй, Ургенч', uz: 'Urganch ziravor doʻkoni', en: 'Spice stall, Urgench' },
    stand: 'Ряд специй, 9',
    ownerName: 'Анвар-ака',
    ownerSince: 2017,
    ownerMotto: {
      ru: 'Зира и изюм — с хорезмских базаров, на развес.',
      uz: 'Zira va mayiz — Xorazm bozorlaridan, tarozida.',
    },
    point: { lat: 41.5505, lng: 60.6321 },
    goods: [['p-zira'], ['p-raisin'], ['p-walnut']],
  },
];

/**
 * Urgench, to check an order end to end from Khorezm: a zone over the city on the default tariff
 * and the dehkan bazaar's stalls. The apps list stores near the delivery address, so Tashkent
 * never sees them, and dispatch matches couriers by the city (Urgench's own courier is seeded
 * below).
 */
async function seedUrganchTest(tenantId: string): Promise<void> {
  const city = await prisma.geoPlace.findUniqueOrThrow({
    where: { level_code: { level: 'CITY', code: 'UZ-XO-C' } },
  });
  const tariff = await prisma.tariff.findFirstOrThrow({ where: { cityId: null } });
  const zone = await prisma.deliveryZone.findFirst({ where: { cityId: city.id, name: 'Urganch' } });
  if (zone === null) {
    await prisma.deliveryZone.create({
      data: {
        name: 'Urganch',
        cityId: city.id,
        tariffId: tariff.id,
        // GeoJSON ring, [lng, lat]: the city and its edges.
        polygon: [
          [
            [60.54, 41.5],
            [60.72, 41.5],
            [60.72, 41.62],
            [60.54, 41.62],
            [60.54, 41.5],
          ],
        ],
        priority: 0,
        active: true,
      },
    });
  }

  const vendor = await prisma.vendor.findFirstOrThrow({
    where: { tenantId, phone: '+998710000001' },
  });
  const fixtureStores = await listStores();
  const fixtureProducts = await listProducts();
  const categories = new Map(
    (await prisma.category.findMany()).map((category) => [category.slug, category.id]),
  );

  for (const stall of URGANCH_STALLS) {
    const source = fixtureStores.find((row) => row.slug === stall.from);
    if (source === undefined)
      throw new Error(`seedUrganchTest: the ${stall.from} store is missing`);
    const profile = {
      name: stall.name,
      address: 'Ургенч, дехканский базар',
      standNumber: stall.stand,
      ownerName: stall.ownerName,
      ownerSince: stall.ownerSince,
      ownerMotto: stall.ownerMotto,
      ownerPhotoUrl: source.ownerPhotoUrl,
      counterPhotoUrl: source.counterPhotoUrl,
      coverUrl: source.coverUrl,
      lat: stall.point.lat,
      lng: stall.point.lng,
      ...(stall.slug === 'urganch-test'
        ? {}
        : { description: source.description ?? Prisma.JsonNull }),
    };
    const store = await prisma.store.upsert({
      where: { tenantId_slug: { tenantId, slug: stall.slug } },
      create: {
        tenantId,
        vendorId: vendor.id,
        cityId: city.id,
        type: 'BAZAAR_STALL',
        status: 'ACTIVE',
        slug: stall.slug,
        preparationMinutes: source.preparationMinutes,
        ...profile,
      },
      update: profile,
    });
    for (let weekday = 0; weekday < 7; weekday += 1) {
      await prisma.storeSchedule.upsert({
        where: { storeId_weekday: { storeId: store.id, weekday } },
        create: {
          storeId: store.id,
          weekday,
          opensAt: HOURS.stall.opensAt,
          closesAt: HOURS.stall.closesAt,
        },
        update: { opensAt: HOURS.stall.opensAt, closesAt: HOURS.stall.closesAt },
      });
    }

    for (const [id, rename] of stall.goods) {
      const product = fixtureProducts.find((row) => row.id === id);
      if (product === undefined) continue;
      const data = {
        categoryId: product.categoryId ? (categories.get(product.categoryId) ?? null) : null,
        name: rename ?? product.name,
        description: product.description ?? Prisma.JsonNull,
        unit: product.unit,
        price: product.price.amount,
        currency: product.price.currency,
        minQuantity: product.minQuantity,
        quantityStep: product.quantityStep,
        available: true,
        stock: product.stock,
        weightGrams: product.weightGrams,
      };
      const slug = `urg-${id.slice(2)}`;
      const row = await prisma.product.upsert({
        where: { storeId_slug: { storeId: store.id, slug } },
        create: { tenantId, storeId: store.id, slug, ...data },
        update: data,
      });
      await prisma.productImage.deleteMany({ where: { productId: row.id } });
      await prisma.productImage.createMany({
        data: product.images.map((image, sortOrder) => ({
          productId: row.id,
          url: image.url,
          sortOrder,
        })),
      });
    }
  }
}

/** The dispatcher login for the admin panel. */
async function seedAdmin(tenantId: string): Promise<void> {
  const phone = '+998710000000';
  await prisma.user.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: {
      tenantId,
      phone,
      firstName: 'Нодира',
      lastName: 'Юсупова',
      locale: 'ru',
      status: 'ACTIVE',
      phoneVerifiedAt: new Date(),
      roles: { create: { role: 'ADMIN' } },
    },
    update: { firstName: 'Нодира', lastName: 'Юсупова' },
  });
}

/** Two demo couriers, offline until the courier app puts them on shift. */
async function seedCouriers(tenantId: string): Promise<number> {
  const cityOf = async (code: string) =>
    prisma.geoPlace.findUniqueOrThrow({ where: { level_code: { level: 'CITY', code } } });
  const couriers = [
    {
      phone: '+998710000002',
      firstName: 'Bekzod',
      lastName: 'Karimov',
      vehicleType: 'SCOOTER' as const,
      city: 'UZ-TK-C',
    },
    {
      phone: '+998710000003',
      firstName: 'Sardor',
      lastName: 'Rashidov',
      vehicleType: 'BICYCLE' as const,
      city: 'UZ-TK-C',
    },
    // Urgench's own courier, for the test stall there: dispatch matches couriers by the city.
    {
      phone: '+998710000004',
      firstName: 'Ulugbek',
      lastName: 'Matyakubov',
      vehicleType: 'SCOOTER' as const,
      city: 'UZ-XO-C',
    },
  ];
  for (const courier of couriers) {
    const city = await cityOf(courier.city);
    const user = await prisma.user.upsert({
      where: { tenantId_phone: { tenantId, phone: courier.phone } },
      create: {
        tenantId,
        phone: courier.phone,
        firstName: courier.firstName,
        lastName: courier.lastName,
        locale: 'ru',
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        roles: { create: { role: 'COURIER' } },
      },
      update: { firstName: courier.firstName, lastName: courier.lastName },
    });
    await prisma.courier.upsert({
      where: { userId: user.id },
      create: {
        tenantId,
        userId: user.id,
        cityId: city.id,
        vehicleType: courier.vehicleType,
        rating: 4.9,
        ratingCount: 120,
        verifiedAt: new Date(),
      },
      update: {},
    });
  }
  return couriers.length;
}

async function main(): Promise<void> {
  const tenantId = await seedTenant();
  const places = await seedGeography();
  const categories = await seedCategories();
  await seedTariff();
  await seedZone();
  const storefront = await seedStorefront(tenantId);
  await seedUrganchTest(tenantId);
  const couriers = await seedCouriers(tenantId);
  await seedAdmin(tenantId);

  console.log(
    `Seeded reference data: tenant ${tenantId}, ${places} geo places, ${categories} categories, 1 tariff, ${storefront.stores} stores, ${storefront.products} products, ${couriers} couriers.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
