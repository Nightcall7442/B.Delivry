/** Russian counts need three forms: 1 товар, 2 товара, 5 товаров. */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/**
 * Binds a one- or two-letter word to the word after it with a no-break space, so a line never
 * ends on «и» or «в»: «Овощи и зелень» breaks as «Овощи / и зелень», not «Овощи и / зелень».
 */
export function bindShortWords(text: string): string {
  return text.replace(/(^|[\s(«])([\p{L}]{1,2}) (?=\S)/gu, '$1$2 ');
}

/**
 * The first words of a sentence for a card with room for a few: no trailing «по» or «и», no
 * full stop before the ellipsis («с шести.…»).
 */
export function firstWords(text: string, count: number): string {
  const words = text
    .trim()
    .replace(/[.!…]+$/, '')
    .split(/\s+/);
  if (words.length <= count) return words.join(' ');
  const cut = words.slice(0, count);
  while (cut.length > 1 && (cut[cut.length - 1] ?? '').replace(/[^\p{L}]/gu, '').length <= 2)
    cut.pop();
  return `${cut.join(' ').replace(/[.,;:!?—–-]+$/u, '')}…`;
}
