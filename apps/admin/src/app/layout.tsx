import type { Metadata, Viewport } from 'next';
import { Alegreya, Caveat, Roboto } from 'next/font/google';

import { Providers } from '@/app/providers';

import '@/styles/globals.css';

const roboto = Roboto({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// The bazaar's two voices, the same as in the app: serif for names and titles, handwriting for
// prices, notes and the sidebar. `--font-display` is what the preset's `font-display` reads.
const alegreya = Alegreya({
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin', 'cyrillic'],
  weight: ['700'],
  variable: '--font-hand',
  display: 'swap',
});

export const metadata: Metadata = { title: 'За прилавком — Bazar Delivery' };
export const viewport: Viewport = { themeColor: '#1e1408', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${roboto.variable} ${alegreya.variable} ${caveat.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
