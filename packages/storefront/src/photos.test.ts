/**
 * The photo helper hands out smaller copies of our own pictures. A copy that is not on disk is a
 * broken picture on every screen that asks for it, so the files are checked against the list.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PHOTOS, categoryPhotoUrl, photo } from './photos.js';

const DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'photos');
const HOST = 'https://bazar-delivery.uz/photos';

describe('photo()', () => {
  it('asks for a smaller WebP copy of our own pictures', () => {
    expect(photo(`${HOST}/p-beef.jpg`, 250)).toBe(`${HOST}/w250/p-beef.webp`);
    expect(photo(`${HOST}/p-beef.jpg`, 500)).toBe(`${HOST}/w500/p-beef.webp`);
    expect(photo(`${HOST}/p-beef.jpg`, 960)).toBe(`${HOST}/w960/p-beef.webp`);
  });

  it('answers the widest step with the 960 copy: the originals are 1024 px, nothing sharper exists', () => {
    expect(photo(`${HOST}/p-beef.jpg`, 1280)).toBe(`${HOST}/w960/p-beef.webp`);
  });

  it('swaps the width of a Commons thumbnail in place, as before', () => {
    const commons =
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Melon.jpg/500px-Melon.jpg';
    expect(photo(commons, 960)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Melon.jpg/960px-Melon.jpg',
    );
  });

  it('leaves anything it does not recognise alone', () => {
    expect(photo('https://cdn.example.com/x.png', 500)).toBe('https://cdn.example.com/x.png');
    // A file in a folder of ours that is already a copy is not copied again.
    expect(photo(`${HOST}/w500/p-beef.webp`, 250)).toBe(`${HOST}/w500/p-beef.webp`);
    expect(photo(`${HOST}/sub/p-beef.jpg`, 250)).toBe(`${HOST}/sub/p-beef.jpg`);
  });

  it('serves the category tiles from the 500 px copies', () => {
    expect(categoryPhotoUrl('meat')).toBe(`${HOST}/w500/p-beef.webp`);
  });
});

describe('the copies on disk', () => {
  const originals = readdirSync(DIR).filter((name) => name.endsWith('.jpg'));

  it('exist for every picture of ours, in every width', () => {
    const missing = originals.flatMap((name) =>
      [250, 500, 960]
        .map((width) => `w${width}/${name.replace(/\.jpg$/, '.webp')}`)
        .filter((file) => !existsSync(join(DIR, file))),
    );
    expect(missing).toEqual([]);
  });

  it('exist for every picture the fixtures name', () => {
    const named = Object.values(PHOTOS).map((url) => url.slice(HOST.length + 1));
    expect(named.filter((file) => !originals.includes(file))).toEqual([]);
  });

  it('are really smaller than what they stand for', () => {
    for (const name of originals) {
      const full = statSync(join(DIR, name)).size;
      const tile = statSync(join(DIR, 'w500', name.replace(/\.jpg$/, '.webp'))).size;
      expect(tile * 3).toBeLessThan(full);
    }
  });
});
