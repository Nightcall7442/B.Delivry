/**
 * @bazar/i18n — UI string catalogues (ru is the reference, uz complete, en
 * falls back to ru) and the `t()` that reads them.
 */
export { MESSAGES, UI_LOCALES, createT, type Params, type T } from './t.js';
export type { Catalogue, CountKey, MessageKey } from './messages/types.js';
export { ru } from './messages/ru.js';
export { uz } from './messages/uz.js';
