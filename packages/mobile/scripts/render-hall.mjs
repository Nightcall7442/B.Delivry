// Renders the apps' hall as bitmaps (packages/mobile/assets/hall) from the web's own CSS layers in
// render-hall.html: the ground per light (tile, sink, vignette, grain) as WebP, its light (shafts,
// lamps) as transparent PNG, and the photo grade. A phone composites these instead of rasterising
// the girih as SVG every frame.
//
// Needs Google Chrome and the web dev server on :3000 (it serves /dome/{morning,evening}.svg).
//   node packages/mobile/scripts/render-hall.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = join(here, '..', 'assets', 'hall');
const page = pathToFileURL(join(here, 'render-hall.html')).href;
const chromePath = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9343;

// The ground carries the girih lines, so it keeps density; the light is soft and does not need it.
const JOBS = [
  {
    name: 'hall-morning-ground.webp',
    query: 'light=morning&kind=ground',
    size: [400, 900],
    dpr: 2.5,
    format: 'webp',
    quality: 86,
  },
  {
    name: 'hall-evening-ground.webp',
    query: 'light=evening&kind=ground',
    size: [400, 900],
    dpr: 2.5,
    format: 'webp',
    quality: 86,
  },
  {
    name: 'hall-morning-light.png',
    query: 'light=morning&kind=light',
    size: [400, 900],
    dpr: 1,
    format: 'png',
  },
  {
    name: 'hall-evening-light.png',
    query: 'light=evening&kind=light',
    size: [400, 900],
    dpr: 2,
    format: 'png',
  },
  { name: 'photo-grade.png', query: 'kind=grade', size: [256, 320], dpr: 1, format: 'png' },
];

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'render-hall-'))}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
]);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let targets = [];
for (let i = 0; i < 40 && targets.length === 0; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  } catch {
    await sleep(250);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));
let id = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result ?? message.error);
    pending.delete(message.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

await send('Page.enable');
await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const job of JOBS) {
  const [width, height] = job.size;
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: job.dpr,
    mobile: true,
  });
  await send('Page.navigate', { url: `${page}?${job.query}&w=${width}&h=${height}` });
  await sleep(2500);
  const shot = await send('Page.captureScreenshot', {
    format: job.format,
    ...(job.quality ? { quality: job.quality } : {}),
  });
  const bytes = Buffer.from(shot.data, 'base64');
  writeFileSync(join(out, job.name), bytes);
  console.log(job.name, `${Math.round(bytes.length / 1024)} KB`);
}
ws.close();
chrome.kill();
