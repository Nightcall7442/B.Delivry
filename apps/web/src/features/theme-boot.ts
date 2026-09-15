/** The theme stamp for <head>: dependency-free, tolerant of a blocked storage. */
export const THEME_KEY = 'bazar.theme';
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}})()`;
