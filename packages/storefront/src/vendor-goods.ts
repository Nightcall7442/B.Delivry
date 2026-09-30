/**
 * What the stall's Goods screen rests on: the shelf as the API hands it over, the order the goods
 * are shown in, the search over them, and the two numbers a seller edits — price and stock.
 *
 * Money crosses the wire as integer tiyin; the seller reads and types soum: «12 500» on the screen
 * is 1 250 000 in the request.
 */
import {
  CURRENCY_MINOR_UNITS,
  DEFAULT_CURRENCY,
  PRODUCT_UNIT,
  type Currency,
  type ProductUnit,
} from '@bazar/constants';
import type { MoneyDto, Translated, UpdateProductDto } from '@bazar/types';

import { tr } from './i18n.js';

/** A `ProductDto` cut down to what the shelf shows and the seller edits. */
export interface StallProduct {
  id: string;
  storeId: string;
  name: Translated;
  unit: ProductUnit;
  price: MoneyDto;
  /** The «В наличии» switch: off = the customer does not see the good at all. */
  available: boolean;
  /** null = the seller does not count this good (the normal case at a bazaar). */
  stock: number | null;
  imageUrl: string | null;
  arrivedAt: string | null;
}

export type InputResult<T> = { ok: true; value: T } | { ok: false; error: string };

// ---- the shelf ----------------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A number, or the decimal string the database driver writes for one («12.500»). */
function numeric(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const UNITS: readonly string[] = Object.values(PRODUCT_UNIT);
const CURRENCIES: readonly string[] = Object.keys(CURRENCY_MINOR_UNITS);

function toStallProduct(row: unknown): StallProduct | null {
  if (!isRecord(row) || typeof row.id !== 'string' || typeof row.storeId !== 'string') return null;
  const priceField = row.price;
  const amount = isRecord(priceField) ? numeric(priceField.amount) : numeric(priceField);
  if (amount === null) return null;
  const currencyField = isRecord(priceField) ? priceField.currency : row.currency;
  const currency: Currency =
    typeof currencyField === 'string' && CURRENCIES.includes(currencyField)
      ? (currencyField as Currency)
      : DEFAULT_CURRENCY;
  const name = isRecord(row.name)
    ? Object.fromEntries(Object.entries(row.name).filter(([, text]) => typeof text === 'string'))
    : {};
  const photo = Array.isArray(row.images) ? row.images.find(isRecord) : undefined;
  return {
    id: row.id,
    storeId: row.storeId,
    name: name as Translated,
    unit:
      typeof row.unit === 'string' && UNITS.includes(row.unit)
        ? (row.unit as ProductUnit)
        : PRODUCT_UNIT.PCS,
    price: { amount, currency },
    available: row.available !== false,
    stock: numeric(row.stock),
    imageUrl: typeof photo?.url === 'string' ? photo.url : null,
    arrivedAt: typeof row.arrivedAt === 'string' ? row.arrivedAt : null,
  };
}

/**
 * The seller's own list (`GET /products`) answers database rows, not `ProductDto`s: the price is a
 * bare integer beside its `currency`, the stock a decimal string. Both shapes are read, so the day
 * that route starts answering DTOs nothing here changes. Rows that are not goods are dropped, and a
 * good that two pages both carried (one was created between the requests) counts once.
 */
export function toStallProducts(rows: readonly unknown[]): StallProduct[] {
  const seen = new Set<string>();
  const products: StallProduct[] = [];
  for (const row of rows) {
    const product = toStallProduct(row);
    if (product === null || seen.has(product.id)) continue;
    seen.add(product.id);
    products.push(product);
  }
  return products;
}

/** Counted and nothing left: the switch may still be on, but nobody can buy it. */
export const isSoldOut = (product: Pick<StallProduct, 'stock'>): boolean =>
  product.stock !== null && product.stock <= 0;

/** «12», «1,5», «0,25»: at most three decimals, the comma Russian readers expect. */
export const stockText = (stock: number): string =>
  String(Number(stock.toFixed(3))).replace('.', ',');

/** On sale with stock first, then on sale with nothing left, then off the shelf; A–Я inside each. */
const rank = (product: StallProduct): number =>
  !product.available ? 2 : isSoldOut(product) ? 1 : 0;

export function sortStallProducts(products: readonly StallProduct[]): StallProduct[] {
  return [...products].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      tr(a.name, 'ru').localeCompare(tr(b.name, 'ru'), 'ru', { sensitivity: 'base' }),
  );
}

/** Case, «ё» and the Uzbek apostrophes (oʻ, gʻ) must not stand between a seller and a good. */
const fold = (text: string): string =>
  text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[ʻʼ'’`ʹ]/g, '');

/** Every word typed must be somewhere in the good's name, in any language it has one. */
export function searchStallProducts(
  products: readonly StallProduct[],
  query: string,
): StallProduct[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...products];
  return products.filter((product) => {
    const names = Object.values(product.name).filter((text): text is string => Boolean(text));
    const haystack = fold(names.join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

// ---- price and stock ----------------------------------------------------------------------------

/** The price column is a 32-bit integer of tiyin. */
export const MAX_PRICE_MINOR = 2_147_483_647;
/** Decimal(10,3) in the database. */
const MAX_STOCK = 9_999_999;

const squeeze = (text: string): string => text.replace(/[\s  ]/g, '').replace(',', '.');

/** «12 500», «12500,5» → minor units. */
export function parsePriceInput(
  text: string,
  currency: Currency = DEFAULT_CURRENCY,
): InputResult<number> {
  const cleaned = squeeze(text);
  if (cleaned === '') return { ok: false, error: 'Впишите цену' };
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, error: 'Цена — число, например 12500' };
  }
  const digits = CURRENCY_MINOR_UNITS[currency];
  const [whole = '0', fraction = ''] = cleaned.split('.');
  // Digit by digit, not `Number(text) * 100`: 1.005 is 1.00499… as a float and would round down.
  let minor =
    Number(whole) * 10 ** digits + Number(fraction.slice(0, digits).padEnd(digits, '0') || 0);
  if (fraction.length > digits && fraction.charAt(digits) >= '5') minor += 1;
  if (minor <= 0) return { ok: false, error: 'Цена должна быть больше нуля' };
  if (minor > MAX_PRICE_MINOR) return { ok: false, error: 'Слишком большая цена' };
  return { ok: true, value: minor };
}

/** Minor units → the text the price field opens with: «12500», «12500.5». */
export function priceInputText(minor: number, currency: Currency = DEFAULT_CURRENCY): string {
  const digits = CURRENCY_MINOR_UNITS[currency];
  const major = minor / 10 ** digits;
  return Number.isInteger(major) ? String(major) : major.toFixed(digits).replace(/0+$/, '');
}

const FRACTIONAL: readonly ProductUnit[] = [
  PRODUCT_UNIT.KG,
  PRODUCT_UNIT.G,
  PRODUCT_UNIT.L,
  PRODUCT_UNIT.ML,
];

/** Goods that are weighed or poured can be half-stocked; pieces, packs and boxes cannot. */
export const isFractionalUnit = (unit: ProductUnit): boolean => FRACTIONAL.includes(unit);

/** Empty = the seller does not count this good: the value is null. */
export function parseStockInput(text: string, unit: ProductUnit): InputResult<number | null> {
  const cleaned = squeeze(text);
  if (cleaned === '') return { ok: true, value: null };
  const fractional = isFractionalUnit(unit);
  if (!(fractional ? /^\d+(\.\d{1,3})?$/ : /^\d+$/).test(cleaned)) {
    return {
      ok: false,
      error: fractional ? 'Остаток — число, до трёх знаков после запятой' : 'Остаток — целое число',
    };
  }
  const stock = Number(cleaned);
  if (stock > MAX_STOCK) return { ok: false, error: 'Слишком большой остаток' };
  return { ok: true, value: stock };
}

export interface ProductEditInput {
  /** Soum, as typed. */
  price: string;
  stock: string;
}

export type ProductEditResult =
  | {
      ok: true;
      /** False when the seller opened the sheet and saved it as it was: nothing to send. */
      changed: boolean;
      update: Required<Pick<UpdateProductDto, 'price'>> & Pick<UpdateProductDto, 'stock'>;
    }
  | { ok: false; errors: { price?: string; stock?: string } };

/**
 * The edit sheet's two fields against the good: the admin cabinet's payload — the price in minor
 * units, the stock only when typed. An empty stock field cannot switch counting off (the API has no
 * way to say «null»: it would read it as 0 and sell the good out), so on a counted good it is a
 * mistake to be pointed out rather than a silent «leave as is».
 */
export function validateProductEdit(
  input: ProductEditInput,
  product: Pick<StallProduct, 'price' | 'stock' | 'unit'>,
): ProductEditResult {
  const price = parsePriceInput(input.price, product.price.currency);
  const stock = parseStockInput(input.stock, product.unit);
  const errors: { price?: string; stock?: string } = {};
  if (!price.ok) errors.price = price.error;
  if (!stock.ok) errors.stock = stock.error;
  else if (stock.value === null && product.stock !== null) {
    errors.stock = 'Остаток уже считается — впишите число (0, если товара нет)';
  }
  if (!price.ok || !stock.ok || errors.stock !== undefined) return { ok: false, errors };
  return {
    ok: true,
    changed:
      price.value !== product.price.amount ||
      (stock.value !== null && stock.value !== product.stock),
    update: {
      price: { amount: price.value, currency: product.price.currency },
      ...(stock.value === null ? {} : { stock: stock.value }),
    },
  };
}
