/**
 * Uzbek writes oʻ and gʻ with U+02BB (and the hard sign with U+02BC). Manrope and Caveat carry
 * neither; in a browser a system font stepped in with its own width — «so‘ m», «QOʻ Y GOʻ SHTI».
 * These two faces (1 KB each, cut from the same fonts, as on the site) hold the fonts' own ‘ and ’
 * under those code points. Added after expo-font's faces: for a character two faces of a family
 * both claim, the browser tries the later rule first. A phone falls back per glyph on its own.
 */
import { Platform } from 'react-native';

const MANROPE =
  'data:font/woff2;base64,d09GMgABAAAAAAQgABIAAAAACXgAAAO8AASBBgAAAAAAAAAAAAAAAAAAAAAAAAAAGyAcMD9IVkFSQgZgP1NUQVSBAgA8L2oRCAqCJIIHMIEYATYCJAMOCwoABCAFhyYHIAwHGxUIERWkb1F8cWC3WT4OiWJ6UsO8e62yv3w8fPyf1bkPQbt2M3BmzTdQZiX2SOmFviAieUT7HQD5j9s4tM7flsrFGQlAPukFoy7lpOPH7j2LEYpFNKK9g3T7wpl8aRTCp/Djv6UClU4HllhEY56pn+osJWMV3TkRZ/bZSQXaDDVcrLXORlupyKAFEGiznBWkkFNtz1m9Bxl+0O5TD5lSxK8QoIbRm3d2CPQXgokmkgkBzvS3v4VMJKksO9CTcvJadiNOX+yTe62SHMdTNLluud7G63swuac+qLLVf1di1CfbISAr8gtRlwmhIlBTxlDJjH33mxrQZbAlrKFhEzsIiPAkAiKJ5ZAiiTROVMsDoyx+DQx5/WqUQPrKaR0kSFGTCtRklkJJJiTJvfVBLST31Ae2/OevBSDQIxFqytr0KfEkniStQ4jAk0QlEmI5ohopcSLRFhnxq2iPnGQ7oiNKqHKiM8r000eXEC26QQYq6MZGOAgVdIBOjCnz9ezoaI+FzT48t170thsuibZo13x1zq2vx92trXnRdWs+2Vv0Tm6euFmx2SBTNyg2IL3rFOuwUxtFgxlbjCW9RVGQ6SsVK7G9yxXLDZcploljixWLMfWivvHUwcVgM27acuTUtnrj1pk/NkzQnY3+56Sw8ePMGvW2qSMpC7Jve2BmtoIf8wsFQmC4DNTBAKsYO1EzVCyGZtY2YMzmG/Q1nHk5xw4mOrMvu/TjDz/+sQl22mns92cfyTgsj4nuT/dawk8zyf3uj6kHNxzpCrc2J/q7b1Jrvdb4OPnDvvzSS0895qhjjmS5bYixnr3ZpUcSyPpKD44cdM+u3WN/q6TlF+Gd2y8/Cj7/6tB3zWw1cvmFKElA8Fe+kT9pppk5wYvpnvtkfGhm7If9KpBZTacOgTlSCAyIwVKRVXEhAcJiLkSiy6NIjfayMQORGxwdKFksloh3WS02EAUdMb8h1OIEJNri/H6qsBkZFboSuZ64dVRSCRBlC8Wz/YryhKgaHO+jzfD4E+2GJv3RoZ6sgk4Dky1e0WWR5ACTFZ5fhJKLGPS7vRn4CAqu0A2JOQWPwKfKmDvNMomFF0agKuLYj+adDpeYV4La2LOdaPrgp9AlsGPrrGv1820ec/WL9j96UZ4YGA7bo+5w8T5cj4u05C3frxg2O+m5YKrOyL87068X4VD6cdSOpGl7Ie/cd5c/TZFPzq8uV0pkYt9B1C6sPEMsn5OPJeXzqZJ7iY+URJYUJE1SSRJSZHLK7Yqnc64+93D0jVkA';
const CAVEAT =
  'data:font/woff2;base64,d09GMgABAAAAAAPAABIAAAAAB6gAAANcAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGyAcKj9IVkFSMQZgP1NUQVQ8ADwvOBEICoI0gWgwgQYBNgIkAwoLCAAEIAWEcAcgDAcbGwYArgZjYzbWkworpEaN7jrNhbaTeR7lP2SDKtaqrO6ZWTgCdA8kESA8KZT3/u4lsSMQEoD3fy5zhIroywNWI1ZIqoTpa9MBGzXjAP2UGM9jt/fvDlMIEmltAaUt8CjzAklCq4bWeV/FsakUoi4msAlIc3L8VZa0LKPszv/awv+5ph5IAea3S9DDQ4xeUoVtuqNhtM5OaO+AZmsaUOE8aTgrnbqNY8THNDrKKsSTIpBUqpyGjc1DiAsA/wEAgaR6jYwTLbtwZEOJ+S6AAOSC5v0zphLIJOAAxKkQ5JKOEsJ2mwHA6OfZmmHiA6BygKcaNe6vw59tKiV+/CfAH2kAAXTYIgAqOZE4gVwGStmmqBQACORyYJGOgl2AACp2EQADDq4nkwk0gigtzJNVSv6DnZXi/177+yUBAAKZjOQySd3KUdAKIgrsF6vM70wN0U8GAAcQgRgYB1gKAAgAhETN3b2iYjexI7v4QjQuru/E07v0jIuXU8VitVqcdjPZYjadT6dyuVnOw3ZV/VKr1broWOGaV1wWvaKWelDtdkeqnafVS6XcqMW/spL/GJNv+cXWQ7DHkNumqTQhb/OijRlwnfbMC/DOtDv3rV/nwfXP3ce/5g9O15YVVjm+no8Lm5VX3YxLAU8vxvZEZ298Pws0IFHiMiaPOPr1gwNAQARKOYByAMV6e/As4kqR1kkhrlKgSKbUH+/f//hnpIIkFvvBx4OWSh4MYrGPbWbluJZeS/U3H6D65Yv73eqJr1+lX78y54UPgq8gYBhoUmTPJwZ/jbu/ADydOfcJ4NnL9f//T9/Lo34VRAyA8P+lbWIgjxDEPIsGrF654oyrEE4R25WmD6eWAPrgvSKpMTDp+sF1uwiBUu8gVBwYidAo2XS9MXIEqdnCk0jXD0Y8B8CpT+TZAyozYRTkuOHSKFSE6dapS69KU6gkzCicSxIOYSZwIZ1EQJgRfESFXB6m0QqEODwzOnRYTkNUPt7AYshan0ZIYZLIkI14hhYrjrf199knUfhMHNdEu058dZBRzuxbN5szoe/tcSVWOCbV4Gtfk2EUej7VqtZchc2EbvpONf7gxIJp0J3FiqHxNmw6IXU82gpkEivVehTKsRV7Y/7VSMgkCgHg/3SD5rP635nwIQAA';

const FACES: readonly (readonly [family: string, src: string])[] = [
  ['Manrope_500Medium', MANROPE],
  ['Manrope_600SemiBold', MANROPE],
  ['Manrope_700Bold', MANROPE],
  ['Manrope_800ExtraBold', MANROPE],
  ['Caveat_700Bold', CAVEAT],
];

export function patchOkinaOnWeb(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.getElementById('bazar-okina')) return;
  const style = document.createElement('style');
  style.id = 'bazar-okina';
  style.textContent = FACES.map(
    ([family, src]) =>
      `@font-face{font-family:'${family}';src:url(${src}) format('woff2');unicode-range:U+02BB-02BC;font-display:swap}`,
  ).join('');
  document.head.appendChild(style);
}
