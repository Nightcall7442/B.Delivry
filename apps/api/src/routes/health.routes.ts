/**
 * /health, /ready, /metrics.
 */
import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { Container } from '../app/container.js';
import { checkLiveness, checkReadiness } from '../infrastructure/health/index.js';
import { ConsoleSmsProvider } from '../integrations/sms/providers/console.provider.js';
import { metricsContentType, renderMetrics } from '../infrastructure/telemetry/metrics.js';

const VERSION = process.env.npm_package_version ?? '0.0.1';

/**
 * Mounted outside the API prefix and outside auth: a load balancer cannot send
 * a bearer token, and a probe that needs the database to answer would take the
 * whole service out during a brief database blip.
 */
export function healthRoutes(container: Container) {
  return async (app: FastifyInstance): Promise<void> => {
    // Liveness: is this process running. Never touches a dependency.
    app.get('/health', async () => checkLiveness(VERSION));

    // Readiness: can it serve traffic. The database is required; Redis is not.
    app.get('/ready', async (_request, reply) => {
      if (container.redis === null) {
        return reply.send(checkLiveness(VERSION));
      }

      const report = await checkReadiness({
        prisma: container.prisma,
        redis: container.redis,
        version: VERSION,
      });

      return reply.code(report.status === 'up' ? 200 : 503).send(report);
    });

    app.get(container.config.observability.metricsPath, async (_request, reply) => {
      void reply.header('content-type', metricsContentType);
      return reply.send(await renderMetrics());
    });

    // Dev only (the env schema refuses the console provider in production):
    // the "SMS" the console provider swallowed, so a tester can read their own
    // OTP from a phone instead of the server log. Refreshes itself.
    // The page is a way into every account, so it exists only with DEV_SMS_KEY
    // set (local .env included) and sits behind HTTP Basic auth — any user, the
    // key as password: a browser prompt, nothing in the URL or the access log.
    if (container.config.notifications.sms.provider === 'console') {
      app.get('/dev/sms', async (request, reply) => {
        const key = process.env.DEV_SMS_KEY;
        if (!key) return reply.code(404).send({ ok: false });
        const header = request.headers.authorization ?? '';
        const given = header.startsWith('Basic ')
          ? (Buffer.from(header.slice(6), 'base64').toString('utf8').split(':')[1] ?? '')
          : '';
        const a = Buffer.from(given);
        const b = Buffer.from(key);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return reply.code(401).header('www-authenticate', 'Basic realm="dev-sms"').send('');
        }
        const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
        const rows = ConsoleSmsProvider.recent
          .map(
            (m) =>
              `<li><b>${esc(m.text.match(/\d{6}/)?.[0] ?? '')}</b> → ${esc(m.to)}` +
              `<small>${m.at.toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent' })} · ${esc(m.text)}</small></li>`,
          )
          .join('');
        void reply.header('content-type', 'text/html; charset=utf-8');
        return reply.send(
          `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5">` +
            `<meta name="viewport" content="width=device-width,initial-scale=1">` +
            `<title>SMS (console)</title><style>body{font:18px system-ui;padding:16px;max-width:520px;margin:auto}` +
            `li{list-style:none;padding:12px 0;border-bottom:1px solid #ddd}b{font-size:32px;letter-spacing:4px;display:block}` +
            `small{display:block;color:#666;font-size:13px}</style>` +
            `<h3>Коды подтверждения (console SMS)</h3><ul>${rows || '<li>пока ничего — запросите код в приложении</li>'}</ul>`,
        );
      });
    }
  };
}
