/**
 * Root layout: html lang from locale, providers (QueryClient, i18n, theme).
 *
 */
import { brandingCss } from '@bazar/storefront';
import type { Metadata, Viewport } from 'next';
import { Alegreya, Caveat, Manrope, Roboto } from 'next/font/google';
import { headers } from 'next/headers';

import { Providers } from '@/app/providers';
import { DEFAULT_BRAND } from '@/features/branding';
import { THEME_BOOT } from '@/features/theme-boot';
import { serverApi } from '@/lib/api';

import '@/styles/globals.css';

const roboto = Roboto({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const alegreya = Alegreya({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin', 'cyrillic'],
  weight: ['700'],
  variable: '--font-hand',
  display: 'swap',
});

/** White-label: the brand behind the host the browser opened (the default tenant otherwise). */
async function currentTenant() {
  const host = (await headers()).get('host') ?? undefined;
  try {
    return await serverApi().tenants.current(host);
  } catch {
    return DEFAULT_BRAND;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await currentTenant();
  return {
    title: `${tenant.name} — доставка с базаров и магазинов Узбекистана`,
    description:
      'Доставка продуктов и товаров с базаров, магазинов и локальных торговых точек. Рассчитайте стоимость и отследите заказ.',
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0F1216' },
  ],
  width: 'device-width',
  initialScale: 1,
  // The sheet's bottom padding reads env(safe-area-inset-*): only honoured with cover.
  viewportFit: 'cover',
  // Two themes (globals.css): form controls follow whichever is active.
  colorScheme: 'light dark',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await currentTenant();
  const css = brandingCss(tenant.branding);
  // Locale lives in the [locale] segment; ru is the default for the public site.
  return (
    <html
      lang="ru"
      className={`${roboto.variable} ${manrope.variable} ${alegreya.variable} ${caveat.variable}`}
      data-tenant={tenant.slug}
      // The theme stamp is added before hydration by the inline script above.
      suppressHydrationWarning
    >
      <head>
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
        {/* The saved theme is stamped before paint so a dark reader never sees a white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <Providers tenant={tenant}>{children}</Providers>
      </body>
    </html>
  );
}
