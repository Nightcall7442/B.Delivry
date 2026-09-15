/**
 * Fixture photography: Wikimedia Commons thumbnails, one per product and store.
 *
 * Every file is CC-licensed or public domain; the source title is kept next to
 * each URL so a credits page can be generated. Real listings will carry their
 * own `images[]` from the API — this map only feeds the fixtures.
 *
 * The URL is a 500px thumbnail; `photo(url, width)` re-targets it. Commons only
 * serves a fixed ladder of widths (250 / 500 / 960 / 1280), anything else is a 400.
 */

export const PHOTOS: Record<string, string> = {
  // File:Carrots of many colors.jpg (public domain)
  'p-carrot':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Carrots_of_many_colors.jpg/500px-Carrots_of_many_colors.jpg',
  // File:Uzbekistan style plov in Japan.jpg (CC BY-SA 4.0)
  'bundle-plov':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ed/Uzbekistan_style_plov_in_Japan.jpg/500px-Uzbekistan_style_plov_in_Japan.jpg',
  // File:Самарканд, сорпа в уличном кафе.jpg (CC BY-SA 4.0)
  'bundle-shurpa':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e2/%D0%A1%D0%B0%D0%BC%D0%B0%D1%80%D0%BA%D0%B0%D0%BD%D0%B4%2C_%D1%81%D0%BE%D1%80%D0%BF%D0%B0_%D0%B2_%D1%83%D0%BB%D0%B8%D1%87%D0%BD%D0%BE%D0%BC_%D0%BA%D0%B0%D1%84%D0%B5.jpg/500px-%D0%A1%D0%B0%D0%BC%D0%B0%D1%80%D0%BA%D0%B0%D0%BD%D0%B4%2C_%D1%81%D0%BE%D1%80%D0%BF%D0%B0_%D0%B2_%D1%83%D0%BB%D0%B8%D1%87%D0%BD%D0%BE%D0%BC_%D0%BA%D0%B0%D1%84%D0%B5.jpg',
  // File:'Achchiq-chuchuk' - uzbek salad.jpg (CC BY-SA 3.0)
  'bundle-achichuk':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/%27Achchiq-chuchuk%27_-_uzbek_salad.jpg/500px-%27Achchiq-chuchuk%27_-_uzbek_salad.jpg',
  // File:Uzbek samsa and sauce.jpg (CC BY-SA 4.0)
  'bundle-samsa':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Uzbek_samsa_and_sauce.jpg/500px-Uzbek_samsa_and_sauce.jpg',
  // File:Uzbek bread, obi non, lepyoshka.jpg (CC BY-SA 4.0)
  'bundle-breakfast':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Uzbek_bread%2C_obi_non%2C_lepyoshka.jpg/500px-Uzbek_bread%2C_obi_non%2C_lepyoshka.jpg',
  // File:Fruit Baskets with Vendor - Central Food Market - Margilon - Uzbekistan (7553287588).jpg (CC BY-SA 2.0)
  'bundle-fruit':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Fruit_Baskets_with_Vendor_-_Central_Food_Market_-_Margilon_-_Uzbekistan_%287553287588%29.jpg/500px-Fruit_Baskets_with_Vendor_-_Central_Food_Market_-_Margilon_-_Uzbekistan_%287553287588%29.jpg',
  // File:Ripe tomatoes in a tray.jpg
  'p-tomato':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Ripe_tomatoes_in_a_tray.jpg/500px-Ripe_tomatoes_in_a_tray.jpg',
  // File:Fresh cucumbers.jpg
  'p-cucumber':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Fresh_cucumbers.jpg/500px-Fresh_cucumbers.jpg',
  // File:Liat Portal for Foodie Disorder - Parsley.jpg
  'p-greens':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bd/Liat_Portal_for_Foodie_Disorder_-_Parsley.jpg/500px-Liat_Portal_for_Foodie_Disorder_-_Parsley.jpg',
  // File:Solanum tuberosum Red Scarlett20170523 7825.jpg
  'p-potato':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Solanum_tuberosum_Red_Scarlett20170523_7825.jpg/500px-Solanum_tuberosum_Red_Scarlett20170523_7825.jpg',
  // File:Indian Onion.jpg
  'p-onion':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Indian_Onion.jpg/500px-Indian_Onion.jpg',
  // File:Autumn Red peaches.jpg
  'p-peach':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Autumn_Red_peaches.jpg/500px-Autumn_Red_peaches.jpg',
  // File:Green Grapes October 5th.jpg
  'p-grape':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Green_Grapes_October_5th.jpg/500px-Green_Grapes_October_5th.jpg',
  // File:Mirza Torpeda Mirzachul melon of Uzbekistan on fruit stall.jpg
  'p-melon':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Mirza_Torpeda_Mirzachul_melon_of_Uzbekistan_on_fruit_stall.jpg/500px-Mirza_Torpeda_Mirzachul_melon_of_Uzbekistan_on_fruit_stall.jpg',
  // File:Pomegranate02 edit.jpg
  'p-pomegranate':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Pomegranate02_edit.jpg/500px-Pomegranate02_edit.jpg',
  // File:Standing-rib-roast.jpg
  'p-beef':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Standing-rib-roast.jpg/500px-Standing-rib-roast.jpg',
  // File:Raw lamb cutlets with shredded ginger and rosemary.jpg
  'p-lamb':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Raw_lamb_cutlets_with_shredded_ginger_and_rosemary.jpg/500px-Raw_lamb_cutlets_with_shredded_ginger_and_rosemary.jpg',
  // File:Chickens in market.jpg
  'p-chicken':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Chickens_in_market.jpg/500px-Chickens_in_market.jpg',
  // File:Milk bottle and two doughnuts.jpg
  'p-milk':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Milk_bottle_and_two_doughnuts.jpg/500px-Milk_bottle_and_two_doughnuts.jpg',
  // File:Turkish strained yogurt.jpg
  'p-suzma':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Turkish_strained_yogurt.jpg/500px-Turkish_strained_yogurt.jpg',
  // File:6-Pack-Chicken-Eggs.jpg
  'p-eggs':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/6-Pack-Chicken-Eggs.jpg/500px-6-Pack-Chicken-Eggs.jpg',
  // File:Uncooked ST25 rice on bamboo surface.jpg
  'p-rice':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Uncooked_ST25_rice_on_bamboo_surface.jpg/500px-Uncooked_ST25_rice_on_bamboo_surface.jpg',
  // File:Bottle 1 liter Sunflower refined oil.jpg
  'p-oil':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Bottle_1_liter_Sunflower_refined_oil.jpg/500px-Bottle_1_liter_Sunflower_refined_oil.jpg',
  // File:Tesco and Sainsburys own dishwashing liquid.jpg
  'p-soap':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Tesco_and_Sainsburys_own_dishwashing_liquid.jpg/500px-Tesco_and_Sainsburys_own_dishwashing_liquid.jpg',
  // File:Uzbek bread, obi non, lepyoshka.jpg
  'p-obi-non':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Uzbek_bread%2C_obi_non%2C_lepyoshka.jpg/500px-Uzbek_bread%2C_obi_non%2C_lepyoshka.jpg',
  // File:Patir bread.jpg
  'p-patir':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Patir_bread.jpg/500px-Patir_bread.jpg',
  // File:Uzbek samsa in Vienna, Austria.jpg
  'p-samsa':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Uzbek_samsa_in_Vienna%2C_Austria.jpg/500px-Uzbek_samsa_in_Vienna%2C_Austria.jpg',
  // File:Seeds of Cumin.jpg
  'p-zira':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/39/Seeds_of_Cumin.jpg/500px-Seeds_of_Cumin.jpg',
  // File:Sunmaid-Raisin-Pile.jpg
  'p-raisin':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Sunmaid-Raisin-Pile.jpg/500px-Sunmaid-Raisin-Pile.jpg',
  // File:Walnuts - whole and open with halved kernel.jpg
  'p-walnut':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Walnuts_-_whole_and_open_with_halved_kernel.jpg/500px-Walnuts_-_whole_and_open_with_halved_kernel.jpg',
  // File:083b Eski Juva Bozori, mercat de Chorsu (Taixkent), parada de verdures.jpg
  'chorsu-zelen':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/083b_Eski_Juva_Bozori%2C_mercat_de_Chorsu_%28Taixkent%29%2C_parada_de_verdures.jpg/500px-083b_Eski_Juva_Bozori%2C_mercat_de_Chorsu_%28Taixkent%29%2C_parada_de_verdures.jpg',
  // File:Outdoor market fruit stall Market Place Romford London 01.jpg
  'alay-fruits':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Outdoor_market_fruit_stall_Market_Place_Romford_London_01.jpg/500px-Outdoor_market_fruit_stall_Market_Place_Romford_London_01.jpg',
  // File:A Butcher cutting buffalo meat.jpg
  'farhad-meat':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/A_Butcher_cutting_buffalo_meat.jpg/500px-A_Butcher_cutting_buffalo_meat.jpg',
  // File:Supermarket in recife, pernambuco, Brazil.jpg
  'makro-yunusabad':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Supermarket_in_recife%2C_pernambuco%2C_Brazil.jpg/500px-Supermarket_in_recife%2C_pernambuco%2C_Brazil.jpg',
  // File:An Uzbek woman baking bread in a tandoor1.jpg
  'non-uyi':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/An_Uzbek_woman_baking_bread_in_a_tandoor1.jpg/500px-An_Uzbek_woman_baking_bread_in_a_tandoor1.jpg',
  // File:Узбекистан, рынок Чорсу, торговля специями (3).jpg
  ziravor:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/%D0%A3%D0%B7%D0%B1%D0%B5%D0%BA%D0%B8%D1%81%D1%82%D0%B0%D0%BD%2C_%D1%80%D1%8B%D0%BD%D0%BE%D0%BA_%D0%A7%D0%BE%D1%80%D1%81%D1%83%2C_%D1%82%D0%BE%D1%80%D0%B3%D0%BE%D0%B2%D0%BB%D1%8F_%D1%81%D0%BF%D0%B5%D1%86%D0%B8%D1%8F%D0%BC%D0%B8_%283%29.jpg/500px-%D0%A3%D0%B7%D0%B1%D0%B5%D0%BA%D0%B8%D1%81%D1%82%D0%B0%D0%BD%2C_%D1%80%D1%8B%D0%BD%D0%BE%D0%BA_%D0%A7%D0%BE%D1%80%D1%81%D1%83%2C_%D1%82%D0%BE%D1%80%D0%B3%D0%BE%D0%B2%D0%BB%D1%8F_%D1%81%D0%BF%D0%B5%D1%86%D0%B8%D1%8F%D0%BC%D0%B8_%283%29.jpg',
  // File:Chorsu Bazaar in Tashkent.jpg
  'promo-chorsu':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Chorsu_Bazaar_in_Tashkent.jpg/500px-Chorsu_Bazaar_in_Tashkent.jpg',
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
