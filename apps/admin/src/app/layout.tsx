import type { Metadata, Viewport } from 'next';
import { Manrope, Roboto } from 'next/font/google';

import { Providers } from '@/app/providers';

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

export const metadata: Metadata = { title: 'Диспетчерская — Bazar Delivery' };
export const viewport: Viewport = { themeColor: '#14A899', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${roboto.variable} ${manrope.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
