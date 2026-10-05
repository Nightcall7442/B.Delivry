/**
 * The stamp for <head>, before paint: the hall's light by Tashkent time — the lamps are lit from
 * five to five (`isEvening` in @bazar/storefront), so the dome is lapis before the first frame,
 * never teal-then-lapis. The hall is one look, the paper on it always light: the old light/dark
 * choice changed nothing a visitor could see, so it is gone and a saved one is dropped.
 */
const THEME_KEY = 'bazar.theme';
export const THEME_BOOT = `(function(){var h=(new Date().getUTCHours()+5)%24;document.documentElement.dataset.hall=h>=17||h<5?'evening':'morning';try{localStorage.removeItem('${THEME_KEY}')}catch(e){}})()`;
