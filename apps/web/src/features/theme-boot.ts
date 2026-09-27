/**
 * The stamps for <head>, before paint: the saved theme (tolerant of a blocked storage) and the
 * hall's light by Tashkent time — the lamps are lit from five to five (`isEvening` in
 * @bazar/storefront), so the dome is lapis before the first frame, never teal-then-lapis.
 */
export const THEME_KEY = 'bazar.theme';
export const THEME_BOOT = `(function(){var h=(new Date().getUTCHours()+5)%24;document.documentElement.dataset.hall=h>=17||h<5?'evening':'morning';try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}})()`;
