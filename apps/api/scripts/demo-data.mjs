/**
 * Demo data for a customer account, made the way a real day would make it —
 * through the API: an address, two delivered orders (one reviewed), one order
 * on its way with a courier, and some store credit. Re-runnable: it adds, it
 * never deletes.
 *
 *   node scripts/demo-data.mjs                  # for +998710000000
 *   node scripts/demo-data.mjs +998901234567    # for another phone
 *
 * Needs the API on localhost:4000 with SMS_PROVIDER=console and its log in
 * API_LOG (default .local/api3.log): OTP codes are read from there.
 * Node 24 (global fetch + WebSocket).
 *
 * ponytail: courier drives in straight lines with fixed sleeps; the active
 * order keeps its last position — restart the script for a fresh one.
 */
import { readFileSync } from 'node:fs';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const WS = process.env.WS_URL ?? 'ws://localhost:4000/ws';
const LOG = process.env.API_LOG ?? '.local/api3.log';
const CUSTOMER = process.argv[2] ?? '+998710000000';
const PHONES = { vendor: '+998710000001', courier: '+998710000002', admin: '+998710000000' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      'x-locale': 'ru',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json.error)}`);
  return json.data;
}

/** Requests an OTP and reads it back from the console SMS provider's log line. */
async function login(phone) {
  await call(null, 'POST', '/auth/otp/request', { phone });
  await sleep(800);
  const log = readFileSync(LOG, 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
  const re = new RegExp(`to: "\\${phone}"\\s+text: "(\\d{6}) `, 'g');
  let code = null;
  for (const m of log.matchAll(re)) code = m[1];
  if (!code) throw new Error(`no OTP for ${phone} in ${LOG}`);
  const data = await call(null, 'POST', '/auth/otp/verify', { phone, code });
  return data.accessToken;
}

const customer = await login(CUSTOMER);
const vendor = await login(PHONES.vendor);
const courier = await login(PHONES.courier);
const admin = CUSTOMER === PHONES.admin ? customer : await login(PHONES.admin);
console.log('logged in: customer', CUSTOMER, '+ vendor, courier, admin');

// ---------------------------------------------------------------- address
let addresses = await call(customer, 'GET', '/customers/me/addresses');
if (addresses.length === 0) {
  const cities = await call(null, 'GET', '/geo/cities');
  const tashkent = cities.find((c) => c.code === 'UZ-TK-C') ?? cities[0];
  const home = await call(customer, 'POST', '/customers/me/addresses', {
    label: 'HOME',
    title: 'Дом',
    cityId: tashkent.id,
    street: 'ул. Навои',
    house: '12',
    apartment: '45',
    entrance: '2',
    floor: '5',
    intercom: '45',
    landmark: 'напротив метро Чорсу',
    point: { lat: 41.3215, lng: 69.2405 },
    isDefault: true,
  });
  await call(customer, 'POST', '/customers/me/addresses', {
    label: 'WORK',
    title: 'Офис',
    cityId: tashkent.id,
    street: 'пр-т Амира Темура',
    house: '107Б',
    floor: '3',
    landmark: 'бизнес-центр, вход со двора',
    point: { lat: 41.3111, lng: 69.2797 },
  });
  addresses = [home];
  console.log('addresses: Дом + Офис');
}
const address = addresses.find((a) => a.isDefault) ?? addresses[0];

// ---------------------------------------------------------------- courier online
await call(courier, 'PUT', '/couriers/me/status', { status: 'ONLINE' });
const events = [];
const ws = new WebSocket(`${WS}?token=${encodeURIComponent(courier)}`);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
ws.onmessage = (e) => events.push(JSON.parse(e.data));
const sendLocation = (lat, lng, orderId) =>
  ws.send(JSON.stringify({ action: 'location', lat, lng, ...(orderId ? { orderId } : {}) }));
const drive = async (from, to, steps, orderId) => {
  for (let i = 1; i <= steps; i++) {
    sendLocation(
      from.lat + ((to.lat - from.lat) * i) / steps,
      from.lng + ((to.lng - from.lng) * i) / steps,
      orderId,
    );
    await sleep(300);
  }
};

// ---------------------------------------------------------------- orders
const stores = await call(null, 'GET', '/stores?pageSize=100');
const bySlug = (slug) => stores.find((s) => s.slug === slug) ?? stores[0];

/** Order → confirm → courier accepts and drives; `until` = 'DELIVERED' | 'ON_THE_WAY'. */
async function placeOrder(store, count, until) {
  const products = await call(null, 'GET', `/catalog?storeId=${store.id}&pageSize=20`);
  const items = products
    .filter((p) => p.available)
    .slice(0, count)
    .map((p, i) => ({ productId: p.id, quantity: i === 0 ? 2 : 1 }));
  const order = await call(customer, 'POST', '/orders', {
    storeId: store.id,
    addressId: address.id,
    paymentMethod: 'CASH',
    items,
  });
  console.log(`order ${order.number} at ${store.name.ru}: ${order.totals.total.amount / 100} сум`);

  const near = { lat: store.point.lat + 0.002, lng: store.point.lng + 0.002 };
  events.length = 0;
  sendLocation(near.lat, near.lng);
  await sleep(300);
  await call(vendor, 'POST', `/orders/${order.id}/confirm`);
  let offer = null;
  for (let i = 0; i < 60 && !offer; i++) {
    await sleep(250);
    offer = events.find((m) => m.event === 'delivery.offer')?.data ?? null;
  }
  if (!offer) throw new Error(`no courier offer for ${order.number}`);
  const accepted = await call(courier, 'POST', `/delivery/${offer.deliveryId}/accept`, near);
  await drive(near, store.point, 3, order.id);
  await call(courier, 'POST', `/delivery/${offer.deliveryId}/arrived-pickup`);
  await sleep(300);
  await call(courier, 'POST', `/delivery/${offer.deliveryId}/picked-up`);
  const home = order.address.point;
  if (until === 'ON_THE_WAY') {
    // Halfway there, and it stays there: the tracking screen has a courier to show.
    await drive(store.point, { lat: (store.point.lat + home.lat) / 2, lng: (store.point.lng + home.lng) / 2 }, 4, order.id);
    console.log(`  ${order.number}: courier on the way, handover code ${accepted.handoverCode ?? '—'}`);
    return order;
  }
  await drive(store.point, home, 5, order.id);
  await call(courier, 'POST', `/delivery/${offer.deliveryId}/arrived-dropoff`);
  await sleep(300);
  await call(courier, 'POST', `/delivery/${offer.deliveryId}/complete`, {
    lat: home.lat,
    lng: home.lng,
    ...(accepted.handoverCode ? { handoverCode: accepted.handoverCode } : {}),
  });
  console.log(`  ${order.number}: delivered`);
  return order;
}

const first = await placeOrder(bySlug('chorsu-zelen'), 3, 'DELIVERED');
await call(customer, 'POST', '/reviews', {
  orderId: first.id,
  target: 'STORE',
  targetId: first.storeId ?? first.store?.id,
  rating: 5,
  comment: 'Зелень свежая, курьер быстрый. Взвесили при мне — всё честно.',
});
console.log('  review left');
await placeOrder(bySlug('farhad-meat'), 2, 'DELIVERED');
await placeOrder(bySlug('alay-fruits'), 3, 'ON_THE_WAY');

// ---------------------------------------------------------------- store credit
const me = await call(customer, 'GET', '/customers/me');
const balance = await call(customer, 'GET', '/payments/wallet/balance');
if ((balance.balance?.amount ?? balance.amount ?? 0) === 0) {
  await call(admin, 'POST', `/customers/${me.id}/credit`, {
    amount: { amount: 50_000_00, currency: 'UZS' },
    reason: 'Приветственный бонус за первый заказ',
  });
  console.log('store credit: 50 000 сум');
}

ws.close();
console.log('done');
