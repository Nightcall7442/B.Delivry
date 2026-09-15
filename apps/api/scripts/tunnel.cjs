/**
 * Public URL for the local API, for a phone that is not on this Wi-Fi.
 * Uses Expo's anonymous ws-tunnel (the same service `expo start --tunnel`
 * uses), so nothing to sign up for. Prints the URL and keeps running.
 *
 *   node scripts/tunnel.cjs            # tunnels http://127.0.0.1:4000
 *   TUNNEL_PORT=3000 node scripts/tunnel.cjs
 *
 * ponytail: fixed session id so the URL survives restarts; anonymous tunnels
 * are best-effort — switch to `expo login` + EXPO_UNSTABLE_TUNNEL_V2 if flaky.
 */
const { createRequire } = require('node:module');
const path = require('node:path');

// expo-cli 57 pins ws-tunnel ^2.0.0; the root hoists an older 1.x whose
// protocol the server no longer answers, so resolve it through expo-cli.
const customer = path.join(__dirname, '..', '..', 'customer');
const expoPkg = require.resolve('expo/package.json', { paths: [customer] });
const cliPkg = createRequire(expoPkg).resolve('@expo/cli/package.json');
const wstunnel = createRequire(cliPkg)('@expo/ws-tunnel');

const port = process.env.TUNNEL_PORT ?? '4000';
const session = process.env.TUNNEL_SESSION ?? 'bazar-api-' + require('node:os').hostname().toLowerCase().replace(/[^a-z0-9]/g, '');

wstunnel
  .startAsync({
    targetUrl: `http://127.0.0.1:${port}`,
    session,
    onStatusChange: (s) => console.error('[tunnel]', s),
  })
  .then((url) => console.log(String(url).replace(/\/$/, '')))
  .catch((e) => {
    console.error('[tunnel] failed', e);
    process.exit(1);
  });
