/**
 * Smaller copies of the fixture photographs, for the screens that show them small.
 *
 * Every photo in public/photos is a 1024 px JPEG of 200–320 KB. A product tile 150 px wide, a
 * stall's face 60 px wide: each used to download the whole file, over a bazaar's mobile data, a
 * score of them at a time. `photo(url, width)` in @bazar/storefront now asks for
 * `photos/w<width>/<name>.webp`, and this script makes those files:
 *
 *   w250  faces, thumbnails           ≈  8 KB
 *   w500  tiles, cards                ≈ 25 KB
 *   w960  heroes on a phone           ≈ 70 KB
 *
 * The originals stay where they are (the 1280 step and anything that wants the full picture).
 * The copies are committed: a checkout, a CI run and the Docker build all see the same files, and
 * a clone needs no image tooling to run. Run again after adding a photo:
 *
 *   pnpm --filter @bazar/web photos          # only what is missing or older than its source
 *   pnpm --filter @bazar/web photos --force  # all of them
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'photos');
const WIDTHS = [250, 500, 960];
const QUALITY = 72;
const force = process.argv.includes('--force');

const sources = (await readdir(dir)).filter((name) => name.endsWith('.jpg'));
let made = 0;
let before = 0;
const after = Object.fromEntries(WIDTHS.map((width) => [width, 0]));

for (const name of sources) {
  const source = join(dir, name);
  const sourceStat = await stat(source);
  before += sourceStat.size;
  for (const width of WIDTHS) {
    const target = join(dir, `w${width}`, name.replace(/\.jpg$/, '.webp'));
    const current = await stat(target).catch(() => null);
    if (current === null || force || current.mtimeMs < sourceStat.mtimeMs) {
      await mkdir(dirname(target), { recursive: true });
      await sharp(source)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 5 })
        .toFile(target);
      made += 1;
    }
    after[width] += (await stat(target)).size;
  }
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
console.log(`${sources.length} photos, ${made} copies written`);
console.log(`originals: ${kb(before)} (${kb(before / sources.length)} each)`);
for (const width of WIDTHS) {
  console.log(`w${width}: ${kb(after[width])} (${kb(after[width] / sources.length)} each)`);
}
