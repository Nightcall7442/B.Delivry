// MapLibre 6 runs its tile parser in a module worker it locates next to its own
// bundle via import.meta.url — which webpack turns into a file:// path, so in
// production the worker never starts and the map stays blank. Serve the worker
// (and the shared chunk it imports) from /maplibre instead; map-view.tsx points
// setWorkerUrl there. Runs before `next dev` / `next build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(
  dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json')),
  'dist',
);
const out = join(dirname(fileURLToPath(import.meta.url)), '../public/maplibre');
mkdirSync(out, { recursive: true });
for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])
  copyFileSync(join(dist, file), join(out, file));
