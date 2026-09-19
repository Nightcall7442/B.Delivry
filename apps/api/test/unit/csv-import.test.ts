/**
 * The shop's shelf comes in as a spreadsheet export: whatever separator Excel
 * chose, header row first, quotes around names with commas.
 */
import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../src/modules/products/service/products.service.js';

describe('parseCsv', () => {
  it('reads semicolon exports keyed by header', () => {
    const rows = parseCsv('name_ru;price;unit\r\nМолоко 3.2%;12500;PCS\r\nЯйца С1;19000;PCS\r\n');
    expect(rows).toEqual([
      { name_ru: 'Молоко 3.2%', price: '12500', unit: 'PCS' },
      { name_ru: 'Яйца С1', price: '19000', unit: 'PCS' },
    ]);
  });

  it('keeps a quoted comma inside a comma-separated name', () => {
    const rows = parseCsv('name_ru,price\n"Рис лазер, 1 кг",36000\n');
    expect(rows[0]?.name_ru).toBe('Рис лазер, 1 кг');
    expect(rows[0]?.price).toBe('36000');
  });

  it('skips blank lines and lower-cases the header', () => {
    const rows = parseCsv('Name_RU\tPrice\n\nХлеб\t6000\n\n');
    expect(rows).toEqual([{ name_ru: 'Хлеб', price: '6000' }]);
  });
});
