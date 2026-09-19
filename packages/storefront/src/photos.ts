/**
 * Fixture photography: our own set, generated for the project (Nano Banana 2,
 * 2026-09-17) and served from the web app at /photos — one square 1024px
 * JPEG per product, store, person and bundle, all in one morning-light
 * Chorsu look. Real listings carry their own `images[]` from the API — this
 * map only feeds the fixtures.
 *
 * `photo(url, width)` only re-targets Wikimedia Commons thumbnails; these
 * URLs come back unchanged, so every consumer gets the 1024px file.
 */

const HOST = 'https://bazar-delivery.uz/photos';

export const PHOTOS: Record<string, string> = {
  // People and counters for the bazaar scenes.
  'owner-tandoor': `${HOST}/owner-tandoor.jpg`,
  'owner-spices': `${HOST}/owner-spices.jpg`,
  'owner-meat': `${HOST}/owner-meat.jpg`,
  'owner-fruit': `${HOST}/owner-fruit.jpg`,
  'owner-greens': `${HOST}/owner-greens.jpg`,
  'counter-signs': `${HOST}/counter-signs.jpg`,
  'promo-chorsu': `${HOST}/promo-chorsu.jpg`,
  // Stores: the cover of each.
  'chorsu-zelen': `${HOST}/chorsu-zelen.jpg`,
  'alay-fruits': `${HOST}/alay-fruits.jpg`,
  'farhad-meat': `${HOST}/farhad-meat.jpg`,
  'makro-yunusabad': `${HOST}/makro-yunusabad.jpg`,
  'non-uyi': `${HOST}/non-uyi.jpg`,
  ziravor: `${HOST}/ziravor.jpg`,
  // Shops: the aisle, the glass front, the corner shop at night and its counter.
  korzinka: `${HOST}/korzinka.jpg`,
  'korzinka-chilanzar': `${HOST}/korzinka-chilanzar.jpg`,
  'lavka-yunusabad-4': `${HOST}/lavka-yunusabad-4.jpg`,
  'lavka-inside': `${HOST}/lavka-inside.jpg`,
  // Bundles.
  'bundle-plov': `${HOST}/bundle-plov.jpg`,
  'bundle-shurpa': `${HOST}/bundle-shurpa.jpg`,
  'bundle-achichuk': `${HOST}/bundle-achichuk.jpg`,
  'bundle-samsa': `${HOST}/bundle-samsa.jpg`,
  'bundle-breakfast': `${HOST}/bundle-breakfast.jpg`,
  'bundle-fruit': `${HOST}/bundle-fruit.jpg`,
  // Products.
  'p-tomato': `${HOST}/p-tomato.jpg`,
  'p-cucumber': `${HOST}/p-cucumber.jpg`,
  'p-greens': `${HOST}/p-greens.jpg`,
  'p-potato': `${HOST}/p-potato.jpg`,
  'p-onion': `${HOST}/p-onion.jpg`,
  'p-carrot': `${HOST}/p-carrot.jpg`,
  'p-peach': `${HOST}/p-peach.jpg`,
  'p-grape': `${HOST}/p-grape.jpg`,
  'p-melon': `${HOST}/p-melon.jpg`,
  'p-pomegranate': `${HOST}/p-pomegranate.jpg`,
  'p-beef': `${HOST}/p-beef.jpg`,
  'p-lamb': `${HOST}/p-lamb.jpg`,
  'p-chicken': `${HOST}/p-chicken.jpg`,
  'p-milk': `${HOST}/p-milk.jpg`,
  'p-suzma': `${HOST}/p-suzma.jpg`,
  'p-eggs': `${HOST}/p-eggs.jpg`,
  'p-rice': `${HOST}/p-rice.jpg`,
  'p-oil': `${HOST}/p-oil.jpg`,
  'p-soap': `${HOST}/p-soap.jpg`,
  'p-obi-non': `${HOST}/p-obi-non.jpg`,
  'p-patir': `${HOST}/p-patir.jpg`,
  'p-samsa': `${HOST}/p-samsa.jpg`,
  'p-zira': `${HOST}/p-zira.jpg`,
  'p-raisin': `${HOST}/p-raisin.jpg`,
  'p-walnut': `${HOST}/p-walnut.jpg`,
};

export type PhotoWidth = 250 | 500 | 960 | 1280;

/** Commons thumbnails are "<hash>/<file>/<N>px-<file>": swap the width in place. */
export const photo = (url: string, width: PhotoWidth): string =>
  url.replace(/\/\d+px-/, `/${width}px-`);

/** Real produce on the category tiles, the way a counter looks — not a pictogram. */
export const CATEGORY_PHOTO: Record<string, string> = {
  vegetables: 'p-tomato',
  fruits: 'p-pomegranate',
  meat: 'p-beef',
  dairy: 'p-eggs',
  bakery: 'p-obi-non',
  grocery: 'p-rice',
  spices: 'p-raisin',
  household: 'p-soap',
};
export function categoryPhotoUrl(slug: string, width: PhotoWidth = 500): string | null {
  const url = PHOTOS[CATEGORY_PHOTO[slug] ?? ''];
  return url ? photo(url, width) : null;
}
