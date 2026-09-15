/**
 * Recipe sets: one tap puts a whole dish on the cart. A set names products by
 * slug, so it survives catalogue edits; anything the API no longer sells is
 * simply left out of the resolved list (and the price).
 */
import type { ProductDto, Translated } from '@bazar/types';

import { PHOTOS } from './photos.js';

export interface BundleLine {
  productSlug: string;
  quantity: number;
}

export interface Bundle {
  slug: string;
  title: Translated;
  /** The dish and the occasion, one sentence. */
  description: Translated;
  /** How many people the set feeds. */
  serves: number;
  photo: string;
  items: readonly BundleLine[];
}

export const BUNDLES: readonly Bundle[] = [
  {
    slug: 'plov',
    title: { ru: 'Плов на 6 человек', uz: '6 kishilik palov', en: 'Plov for six' },
    description: {
      ru: 'Баранина, жёлтая морковь, девзира и зира с Чорсу — всё, кроме казана.',
      uz: 'Qoʻy goʻshti, sariq sabzi, devzira va zira — qozondan tashqari hammasi.',
      en: 'Lamb, yellow carrots, devzira rice and cumin from Chorsu — everything but the kazan.',
    },
    serves: 6,
    photo: PHOTOS['bundle-plov'] ?? '',
    items: [
      { productSlug: 'p-lamb', quantity: 1 },
      { productSlug: 'p-rice', quantity: 1 },
      { productSlug: 'p-carrot', quantity: 1 },
      { productSlug: 'p-onion', quantity: 0.5 },
      { productSlug: 'p-oil', quantity: 1 },
      { productSlug: 'p-zira', quantity: 1 },
      { productSlug: 'p-raisin', quantity: 0.2 },
    ],
  },
  {
    slug: 'shurpa',
    title: { ru: 'Шурпа на 4 человека', uz: '4 kishilik shoʻrva', en: 'Shurpa for four' },
    description: {
      ru: 'Баранина на кости, картофель, помидоры, лук и зелень — суп на два дня.',
      uz: 'Suyakli qoʻy goʻshti, kartoshka, pomidor, piyoz va koʻkat — ikki kunlik shoʻrva.',
      en: 'Lamb on the bone, potatoes, tomatoes, onion and greens — soup for two days.',
    },
    serves: 4,
    photo: PHOTOS['bundle-shurpa'] ?? '',
    items: [
      { productSlug: 'p-lamb', quantity: 0.7 },
      { productSlug: 'p-potato', quantity: 1 },
      { productSlug: 'p-tomato', quantity: 0.5 },
      { productSlug: 'p-onion', quantity: 0.3 },
      { productSlug: 'p-carrot', quantity: 0.3 },
      { productSlug: 'p-greens', quantity: 1 },
    ],
  },
  {
    slug: 'achichuk',
    title: { ru: 'Салат ачичук', uz: 'Achchiq-chuchuk salat', en: 'Achichuk salad' },
    description: {
      ru: 'Бакинские помидоры, огурцы, лук и зелень — к плову или просто так.',
      uz: 'Boku pomidori, bodring, piyoz va koʻkat — palovga yoki shunchaki.',
      en: 'Baku tomatoes, cucumbers, onion and greens — for the plov, or on its own.',
    },
    serves: 4,
    photo: PHOTOS['bundle-achichuk'] ?? '',
    items: [
      { productSlug: 'p-tomato', quantity: 0.6 },
      { productSlug: 'p-cucumber', quantity: 0.4 },
      { productSlug: 'p-onion', quantity: 0.2 },
      { productSlug: 'p-greens', quantity: 1 },
    ],
  },
  {
    slug: 'samsa-tea',
    title: { ru: 'Самса к чаю', uz: 'Choyga somsa', en: 'Samsa for tea' },
    description: {
      ru: 'Четыре самсы с мясом и патыр из тандыра, горячие к 16:00.',
      uz: 'Toʻrtta goʻshtli somsa va tandir patir, 16:00 ga issiq.',
      en: 'Four meat samsa and a tandoor patir, hot by four.',
    },
    serves: 2,
    photo: PHOTOS['bundle-samsa'] ?? '',
    items: [
      { productSlug: 'p-samsa', quantity: 4 },
      { productSlug: 'p-patir', quantity: 1 },
    ],
  },
  {
    slug: 'breakfast',
    title: { ru: 'Завтрак с базара', uz: 'Bozordan nonushta', en: 'Breakfast from the bazaar' },
    description: {
      ru: 'Оби нон из тандыра, яйца, молоко и сузьма — на неделю утренних чаёв.',
      uz: 'Tandir obi non, tuxum, sut va suzma — bir haftalik ertalabki choyga.',
      en: 'Tandoor obi non, eggs, milk and suzma — a week of morning tea.',
    },
    serves: 3,
    photo: PHOTOS['bundle-breakfast'] ?? '',
    items: [
      { productSlug: 'p-obi-non', quantity: 2 },
      { productSlug: 'p-eggs', quantity: 1 },
      { productSlug: 'p-milk', quantity: 1 },
      { productSlug: 'p-suzma', quantity: 0.3 },
    ],
  },
  {
    slug: 'fruit-basket',
    title: { ru: 'Фруктовая корзина', uz: 'Meva savati', en: 'Fruit basket' },
    description: {
      ru: 'Персики, виноград и гранаты с Алайского — гостям или себе.',
      uz: 'Oloy bozoridan shaftoli, uzum va anor — mehmonga yoki oʻzingizga.',
      en: 'Peaches, grapes and pomegranates from Alay — for guests, or for you.',
    },
    serves: 4,
    photo: PHOTOS['bundle-fruit'] ?? '',
    items: [
      { productSlug: 'p-peach', quantity: 1 },
      { productSlug: 'p-grape', quantity: 1 },
      { productSlug: 'p-pomegranate', quantity: 0.8 },
    ],
  },
];

/** Sets sold around a holiday only — `holidays.ts` says when each one is on. */
export const HOLIDAY_BUNDLES: readonly Bundle[] = [
  {
    slug: 'navruz',
    title: { ru: 'Стол к Наврузу', uz: 'Navroʻz dasturxoni', en: 'Navruz table' },
    description: {
      ru: 'Зелень для кук-самсы, орехи, изюм и сузьма, лепёшки из тандыра — на 8 гостей.',
      uz: 'Koʻk somsaga koʻkat, yongʻoq, mayiz va suzma, tandir non — 8 mehmonga.',
      en: 'Greens for kuk-samsa, walnuts, raisins and suzma, tandoor bread — for eight guests.',
    },
    serves: 8,
    photo: PHOTOS['p-greens'] ?? '',
    items: [
      { productSlug: 'p-greens', quantity: 4 },
      { productSlug: 'p-walnut', quantity: 0.5 },
      { productSlug: 'p-raisin', quantity: 0.5 },
      { productSlug: 'p-suzma', quantity: 0.5 },
      { productSlug: 'p-obi-non', quantity: 4 },
      { productSlug: 'p-eggs', quantity: 1 },
    ],
  },
  {
    slug: 'iftar',
    title: { ru: 'Ифтар на семью', uz: 'Oilaviy iftorlik', en: 'Iftar for the family' },
    description: {
      ru: 'Лепёшки, молоко, сузьма, изюм и фрукты — стол к закату без похода на базар.',
      uz: 'Non, sut, suzma, mayiz va meva — bozorga bormasdan shomga dasturxon.',
      en: 'Bread, milk, suzma, raisins and fruit — a sunset table without the trip to the bazaar.',
    },
    serves: 5,
    photo: PHOTOS['bundle-breakfast'] ?? '',
    items: [
      { productSlug: 'p-obi-non', quantity: 3 },
      { productSlug: 'p-milk', quantity: 2 },
      { productSlug: 'p-suzma', quantity: 0.3 },
      { productSlug: 'p-raisin', quantity: 0.3 },
      { productSlug: 'p-grape', quantity: 1 },
      { productSlug: 'p-peach', quantity: 1 },
    ],
  },
  {
    slug: 'kurban',
    title: {
      ru: 'Курбан: мясо и плов',
      uz: 'Qurbon: goʻsht va palov',
      en: 'Kurban: meat and plov',
    },
    description: {
      ru: 'Баранина и говядина на праздничный стол, рис, морковь и зира для казана на 10 человек.',
      uz: 'Bayram dasturxoniga qoʻy va mol goʻshti, 10 kishilik qozonga guruch, sabzi va zira.',
      en: 'Lamb and beef for the holiday table, rice, carrots and cumin for a ten-person kazan.',
    },
    serves: 10,
    photo: PHOTOS['bundle-plov'] ?? '',
    items: [
      { productSlug: 'p-lamb', quantity: 2 },
      { productSlug: 'p-beef', quantity: 1.5 },
      { productSlug: 'p-rice', quantity: 2 },
      { productSlug: 'p-carrot', quantity: 1.5 },
      { productSlug: 'p-onion', quantity: 1 },
      { productSlug: 'p-zira', quantity: 1 },
      { productSlug: 'p-greens', quantity: 2 },
    ],
  },
];

/** By the data (14, 16): a gift, and a wedding table — big quantities, one tap. */
export const OCCASION_BUNDLES: readonly Bundle[] = [
  {
    slug: 'gift-basket',
    title: { ru: 'Подарочная корзина', uz: 'Sovgʻa savati', en: 'Gift basket' },
    description: {
      ru: 'Гранаты, виноград, орехи и изюм — с запиской и доставкой получателю (укажите его в чекауте).',
      uz: 'Anor, uzum, yongʻoq va mayiz — xat bilan, oluvchiga yetkaziladi (chekautda koʻrsating).',
      en: 'Pomegranates, grapes, walnuts and raisins — with a note, delivered to the recipient you name at checkout.',
    },
    serves: 1,
    photo: PHOTOS['bundle-fruit'] ?? '',
    items: [
      { productSlug: 'p-pomegranate', quantity: 1 },
      { productSlug: 'p-grape', quantity: 1 },
      { productSlug: 'p-walnut', quantity: 0.5 },
      { productSlug: 'p-raisin', quantity: 0.5 },
    ],
  },
  {
    slug: 'toy',
    title: {
      ru: 'Той: стол на 30 гостей',
      uz: 'Toʻy: 30 mehmonga dasturxon',
      en: 'Wedding table for thirty',
    },
    description: {
      ru: 'Баранина, рис, морковь и зелень для большого казана, лепёшки и фрукты — оптом, одной доставкой.',
      uz: 'Katta qozonga qoʻy goʻshti, guruch, sabzi va koʻkat, non va meva — ulgurji, bitta yetkazma.',
      en: 'Lamb, rice, carrots and greens for the big kazan, bread and fruit — wholesale, one delivery.',
    },
    serves: 30,
    photo: PHOTOS['bundle-plov'] ?? '',
    items: [
      { productSlug: 'p-lamb', quantity: 6 },
      { productSlug: 'p-rice', quantity: 5 },
      { productSlug: 'p-carrot', quantity: 4 },
      { productSlug: 'p-onion', quantity: 2 },
      { productSlug: 'p-oil', quantity: 2 },
      { productSlug: 'p-greens', quantity: 6 },
      { productSlug: 'p-obi-non', quantity: 15 },
      { productSlug: 'p-grape', quantity: 3 },
    ],
  },
];

export const getBundle = (slug: string): Bundle | null =>
  [...BUNDLES, ...HOLIDAY_BUNDLES, ...OCCASION_BUNDLES].find((bundle) => bundle.slug === slug) ??
  null;

export interface ResolvedBundleLine {
  product: ProductDto;
  quantity: number;
  /** Minor units. */
  total: number;
}

export interface ResolvedBundle {
  bundle: Bundle;
  lines: ResolvedBundleLine[];
  /** Products the set names but the catalogue no longer has. */
  missing: string[];
  total: number;
  storeIds: string[];
}

/** Matches a set against what the API sells right now. */
export function resolveBundle(bundle: Bundle, products: readonly ProductDto[]): ResolvedBundle {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  const lines: ResolvedBundleLine[] = [];
  const missing: string[] = [];
  for (const line of bundle.items) {
    const product = bySlug.get(line.productSlug);
    if (product === undefined || !product.available) {
      missing.push(line.productSlug);
      continue;
    }
    lines.push({
      product,
      quantity: line.quantity,
      total: Math.round(product.price.amount * line.quantity),
    });
  }
  return {
    bundle,
    lines,
    missing,
    total: lines.reduce((sum, line) => sum + line.total, 0),
    storeIds: [...new Set(lines.map((line) => line.product.storeId))],
  };
}
