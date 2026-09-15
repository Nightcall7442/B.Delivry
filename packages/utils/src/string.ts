/**
 * slugify (uz/ru transliteration), truncate.
 */

/** Cyrillic (ru + uz) to latin. Uzbek adds the letters below the base russian set. */
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'i',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  ў: 'o',
  қ: 'q',
  ғ: 'g',
  ҳ: 'h',
};

/** Product and store slugs: URL-safe, stable, generated once on create. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[а-яёўқғҳ]/g, (char) => TRANSLIT[char] ?? '')
      .normalize('NFKD')
      // strip the accents NFKD just split off (combining marks)
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96)
  );
}

export function truncate(input: string, max: number, ellipsis = '...'): string {
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - ellipsis.length)).trimEnd() + ellipsis;
}

export const capitalize = (input: string): string =>
  input.length === 0 ? input : input[0]!.toUpperCase() + input.slice(1);
