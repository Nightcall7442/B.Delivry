import { HALL } from '@bazar/storefront';
import type { Metadata, Viewport } from 'next';

import { Providers } from '@/app/providers';

import '@/styles/globals.css';

// The faces ship with the cabinet too: a build must not depend on fonts.googleapis.com.
import '@fontsource-variable/manrope';
import '@fontsource-variable/alegreya';
import '@fontsource-variable/alegreya/wght-italic.css';

/**
 * The hall's light by Tashkent time, stamped on <html> before paint (the site's THEME_BOOT does
 * the same): the lamps are lit from five to five (`isEvening` in @bazar/storefront), so the dome
 * is lapis before the first frame, never teal-then-lapis.
 */
const HALL_BOOT = `(function(){var h=(new Date().getUTCHours()+5)%24;document.documentElement.dataset.hall=h>=17||h<5?'evening':'morning'})()`;

export const metadata: Metadata = { title: 'За прилавком — Bazar Delivery' };
// The browser's own bar is the top of the hall.
export const viewport: Viewport = { themeColor: HALL.dome, colorScheme: 'light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-hall is added before hydration by the inline script.
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: HALL_BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
