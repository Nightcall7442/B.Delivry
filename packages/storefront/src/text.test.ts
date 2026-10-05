import { describe, expect, it } from 'vitest';

import { bindShortWords, firstWords } from './text.js';

describe('bindShortWords', () => {
  it('keeps a short word with the next one', () => {
    expect(bindShortWords('Овощи и зелень')).toBe('Овощи и зелень');
    expect(bindShortWords('Специи и сухофрукты')).toBe('Специи и сухофрукты');
    expect(bindShortWords('В пути на базар')).toBe('В пути на базар');
    expect(bindShortWords('Sut va tuxum')).toBe('Sut va tuxum');
  });

  it('leaves longer words and a trailing short word alone', () => {
    expect(bindShortWords('Мясо птица')).toBe('Мясо птица');
    expect(bindShortWords('Сыр и')).toBe('Сыр и');
  });
});

describe('firstWords', () => {
  it('keeps a short sentence whole, without its full stop', () => {
    expect(firstWords('Режу на рассвете.', 4)).toBe('Режу на рассвете');
  });

  it('cuts at a word, never after a full stop or a preposition', () => {
    expect(firstWords('Тандыр горячий с шести. Берите с собой', 4)).toBe('Тандыр горячий с шести…');
    expect(firstWords('Дыню выбираю по хвостику — ещё ни разу', 3)).toBe('Дыню выбираю…');
  });
});
