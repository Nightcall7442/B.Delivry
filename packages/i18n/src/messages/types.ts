import type { ru } from './ru.js';

type RuKey = keyof typeof ru;
type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';
type PluralOf<K> = K extends `${infer Base}.one` ? Base : never;

/** Keys that take a count: `cart.items`, `bundle.people`, … */
export type CountKey = PluralOf<RuKey>;
/** Plain keys — everything that is not a plural form. */
export type MessageKey = Exclude<RuKey, `${CountKey}.${PluralCategory}`>;
/** A locale's catalogue: any plain key, any plural form; gaps fall back to ru. */
export type Catalogue = Partial<Record<MessageKey | `${CountKey}.${PluralCategory}`, string>>;
