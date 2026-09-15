/**
 * A shopping list in words → cart lines. Dictated, typed, pasted from a chat
 * or read off a paper note: "2 кг помидор, пучок зелени, 1 non" becomes
 * products with quantities. Matching is by dictionary + the catalogue's own
 * names in uz/ru/en; anything unmatched is returned as-is so the customer
 * can pick it by hand. ponytail: no stemming library — 4-letter prefixes and
 * a synonym table cover a bazaar's vocabulary.
 */
import type { ProductDto } from '@bazar/types';

export interface ListLine {
  raw: string;
  product: ProductDto | null;
  quantity: number;
  /** Candidates when the match was weak: let the customer choose. */
  alternatives: ProductDto[];
}

/** Bazaar words → catalogue words (all lower-case, apostrophes stripped). */
const SYNONYMS: Record<string, string[]> = {
  помидор: ['помидоры', 'pomidor', 'томат'],
  томат: ['помидоры', 'pomidor'],
  картошк: ['картофель', 'kartoshka'],
  картоф: ['картофель', 'kartoshka'],
  лук: ['лук', 'piyoz'],
  пиёз: ['лук', 'piyoz'],
  морков: ['морковь', 'sabzi'],
  сабзи: ['морковь', 'sabzi'],
  огурц: ['огурцы', 'bodring'],
  огурчик: ['огурцы', 'bodring'],
  зелен: ['зелень', 'kokat'],
  укроп: ['зелень', 'kokat'],
  кинз: ['зелень', 'kokat'],
  мяс: ['говядина', 'баранина', 'gosht'],
  говядин: ['говядина', 'mol'],
  баранин: ['баранина', 'qoy'],
  курин: ['курица', 'tovuq'],
  куриц: ['курица', 'tovuq'],
  молок: ['молоко', 'sut'],
  яйц: ['яйца', 'tuxum'],
  яич: ['яйца', 'tuxum'],
  рис: ['рис', 'guruch', 'девзира'],
  масл: ['масло', 'yog'],
  хлеб: ['нон', 'non', 'патыр', 'patir'],
  лепёшк: ['нон', 'non'],
  лепешк: ['нон', 'non'],
  персик: ['персики', 'shaftoli'],
  виноград: ['виноград', 'uzum'],
  дын: ['дыня', 'qovun'],
  гранат: ['гранаты', 'anor'],
  изюм: ['изюм', 'mayiz'],
  орех: ['орех', 'yongoq'],
  зир: ['зира', 'zira'],
  самс: ['самса', 'somsa'],
  сузьм: ['сузьма', 'suzma'],
  мыл: ['мыло', 'sovun'],
  // uz → ru
  pomidor: ['помидоры'],
  kartoshk: ['картофель'],
  piyoz: ['лук'],
  sabzi: ['морковь'],
  bodring: ['огурцы'],
  kokat: ['зелень'],
  gosht: ['говядина', 'баранина'],
  qoy: ['баранина'],
  mol: ['говядина'],
  tovuq: ['курица'],
  sut: ['молоко'],
  tuxum: ['яйца'],
  guruch: ['рис'],
  yog: ['масло'],
  non: ['нон', 'патыр'],
  shaftoli: ['персики'],
  uzum: ['виноград'],
  qovun: ['дыня'],
  anor: ['гранаты'],
  mayiz: ['изюм'],
  yongoq: ['орех'],
  somsa: ['самса'],
  suzma: ['сузьма'],
  sovun: ['мыло'],
};

/** Quantity words. Weighed goods default to kilos, counted ones to pieces. */
const UNIT_WORDS: Record<string, { factor: number; unit: 'KG' | 'PCS' }> = {
  кг: { factor: 1, unit: 'KG' },
  kg: { factor: 1, unit: 'KG' },
  кило: { factor: 1, unit: 'KG' },
  килограмм: { factor: 1, unit: 'KG' },
  kilo: { factor: 1, unit: 'KG' },
  г: { factor: 0.001, unit: 'KG' },
  гр: { factor: 0.001, unit: 'KG' },
  грамм: { factor: 0.001, unit: 'KG' },
  g: { factor: 0.001, unit: 'KG' },
  gr: { factor: 0.001, unit: 'KG' },
  gramm: { factor: 0.001, unit: 'KG' },
  шт: { factor: 1, unit: 'PCS' },
  штук: { factor: 1, unit: 'PCS' },
  штуки: { factor: 1, unit: 'PCS' },
  dona: { factor: 1, unit: 'PCS' },
  ta: { factor: 1, unit: 'PCS' },
  пучок: { factor: 1, unit: 'PCS' },
  пучка: { factor: 1, unit: 'PCS' },
  bog: { factor: 1, unit: 'PCS' },
  boglam: { factor: 1, unit: 'PCS' },
  л: { factor: 1, unit: 'PCS' },
  литр: { factor: 1, unit: 'PCS' },
  litr: { factor: 1, unit: 'PCS' },
};

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одну: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  десять: 10,
  полкило: 0.5,
  полкилограмма: 0.5,
  полтора: 1.5,
  пол: 0.5,
  bir: 1,
  bitta: 1,
  ikki: 2,
  ikkita: 2,
  uch: 3,
  uchta: 3,
  tort: 4,
  tortta: 4,
  besh: 5,
  beshta: 5,
  on: 10,
  yarim: 0.5,
};

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[ʻʼ'’`ʹ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9.,\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stem = (word: string): string =>
  word.length > 5 ? word.slice(0, 5) : word.length > 4 ? word.slice(0, 4) : word;

/** Words a product answers to: its names in every language plus synonyms. */
function keywordsOf(product: ProductDto): Set<string> {
  const words = new Set<string>();
  for (const name of Object.values(product.name)) {
    if (!name) continue;
    for (const word of normalize(name).split(' ')) {
      if (word.length < 3) continue;
      words.add(stem(word));
    }
  }
  return words;
}

const SYNONYM_KEYS = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);
/** "лепёшки" → "лепешк" → the words a catalogue name would contain. */
const synonymsFor = (word: string): string[] => {
  const key = SYNONYM_KEYS.find((k) => word.startsWith(k));
  return key === undefined ? [] : SYNONYMS[key]!;
};

function score(fragmentWords: string[], keywords: Set<string>): number {
  let hits = 0;
  for (const word of fragmentWords) {
    if (keywords.has(stem(word))) {
      hits += 2;
      continue;
    }
    if (synonymsFor(word).some((syn) => keywords.has(stem(normalize(syn))))) hits += 2;
    // Weak signal: shared 4-letter prefix ("помидорчики" / "помид"). Never enough alone.
    else if (word.length >= 4 && [...keywords].some((k) => k.startsWith(word.slice(0, 4))))
      hits += 1;
  }
  return hits;
}

/** Splits "2 кг помидор и пучок зелени, 3 non" into fragments. */
export function splitList(text: string): string[] {
  return text
    .split(/[\n,;]+|\s+(?:и|va|hamda|and)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseFragment(fragment: string, products: readonly ProductDto[]): ListLine {
  const words = normalize(fragment).split(' ').filter(Boolean);
  let quantity: number | null = null;
  let unit: 'KG' | 'PCS' | null = null;
  const rest: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const numeric = Number(word.replace(',', '.'));
    if (!Number.isNaN(numeric) && word !== '') {
      quantity = numeric;
      continue;
    }
    if (word in NUMBER_WORDS) {
      quantity = NUMBER_WORDS[word]!;
      continue;
    }
    // "2кг" / "500г" glued together.
    const glued = /^(\d+(?:[.,]\d+)?)([a-zа-я]+)$/.exec(word);
    if (glued && glued[2]! in UNIT_WORDS) {
      const u = UNIT_WORDS[glued[2]!]!;
      quantity = Number(glued[1]!.replace(',', '.')) * u.factor;
      unit = u.unit;
      continue;
    }
    if (word in UNIT_WORDS) {
      const u = UNIT_WORDS[word]!;
      if (quantity !== null) quantity *= u.factor;
      unit = u.unit;
      continue;
    }
    rest.push(word);
  }

  const ranked = products
    .filter((product) => product.available)
    .map((product) => ({ product, score: score(rest, keywordsOf(product)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const product = best !== undefined && best.score >= 2 ? best.product : null;
  const alternatives = ranked
    .slice(product === null ? 0 : 1, 4)
    .filter((entry) => entry.score >= 1)
    .map((entry) => entry.product);

  const fallback = product?.minQuantity || product?.quantityStep || 1;
  // "пучок зелени" for a per-kilo product is still one unit of it; a bare
  // number for a weighed product means kilos.
  const resolved =
    quantity === null
      ? fallback
      : unit === 'PCS' && product?.unit === 'KG'
        ? fallback * quantity
        : quantity;
  return {
    raw: fragment,
    product,
    quantity: Math.max(0.1, Math.round(resolved * 100) / 100),
    alternatives,
  };
}

export const parseShoppingList = (text: string, products: readonly ProductDto[]): ListLine[] =>
  splitList(text).map((fragment) => parseFragment(fragment, products));
