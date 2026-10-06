import { describe, expect, it } from 'vitest';
import { MESSAGES, createT, ru } from '../src/index.js';

describe('t', () => {
  it('reads the locale, falls back to ru, then to the key', () => {
    expect(createT('uz')('cart.title')).toBe('Savat');
    expect(createT('en')('cart.title')).toBe('Корзина');
    expect(createT('xx')('cart.title')).toBe('Корзина');
    expect(createT('ru')('nope' as never)).toBe('nope');
  });

  it('picks plural forms per language and fills the count', () => {
    const t = createT('ru');
    expect([1, 3, 5, 11, 21].map((n) => t.n('cart.items', n))).toEqual([
      '1 товар',
      '3 товара',
      '5 товаров',
      '11 товаров',
      '21 товар',
    ]);
    expect(createT('uz').n('cart.items', 5)).toBe('5 ta mahsulot');
    expect(createT('ru')('login.sent', { count: 6, phone: '+998' })).toBe(
      'Отправили 6 цифр на +998',
    );
  });

  it('uz covers every ru key (plural bases included)', () => {
    const base = (key: string) => key.replace(/\.(one|few|many)$/, '');
    const uzKeys = new Set(Object.keys(MESSAGES.uz).map((key) => key.replace(/\.other$/, '')));
    const missing = Object.keys(ru)
      .map(base)
      .filter((key) => !uzKeys.has(key));
    expect(missing).toEqual([]);
  });

  it('writes Uzbek numbers as Russian does, whatever locale data the runtime has', () => {
    expect(createT('uz').qty(1.5)).toBe('1,5');
    expect(createT('uz').qty(12000)).toBe(createT('ru').qty(12000));
    expect(createT('en').qty(1.5)).toBe('1.5');
    expect(createT('uz').rating(4.8)).toBe('4,8');
    expect(createT('ru').rating(5)).toBe('5,0');
  });

  it('writes a moment on the Tashkent clock from the catalogue, in any runtime zone', () => {
    // 19:18 UTC on 5 October is 00:18 on Tuesday the 6th in Tashkent.
    const late = '2026-10-05T19:18:00Z';
    expect(createT('ru').when(late)).toBe('6 октября');
    expect(createT('ru').when(late, { weekday: true })).toBe('вторник, 6 октября');
    expect(createT('ru').when(late, { time: true })).toBe('6 октября в 00:18');
    expect(createT('uz').when(late, { weekday: true })).toBe('seshanba, 6 oktabr');
    expect(createT('uz').when(late, { time: true })).toBe('6 oktabr, 00:18');
  });
});
