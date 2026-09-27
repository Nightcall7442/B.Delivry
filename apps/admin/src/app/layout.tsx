import type { Metadata, Viewport } from 'next';

import { Providers } from '@/app/providers';

import '@/styles/globals.css';

// The faces ship with the cabinet too: a build must not depend on fonts.googleapis.com.
import '@fontsource-variable/roboto';
import '@fontsource-variable/alegreya';
import '@fontsource-variable/alegreya/wght-italic.css';
import '@fontsource-variable/caveat';

export const metadata: Metadata = { title: 'За прилавком — Bazar Delivery' };
export const viewport: Viewport = { themeColor: '#101524', colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
