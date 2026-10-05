/**
 * The site's own foot: where the rest of the bazaar is — the prices, the promises, selling with us,
 * the documents. Shop pages ended in bare ground, and the menu lives only on some of them.
 */
import { createT, type MessageKey } from '@bazar/i18n';
import Link from 'next/link';

import s from './bazar.module.css';

const LINKS: ReadonlyArray<{ href: string; key: MessageKey }> = [
  { href: '/prices', key: 'menu.prices' },
  { href: '/rules', key: 'menu.rules' },
  { href: '/plus', key: 'menu.plus' },
  { href: '/business', key: 'menu.business' },
  { href: '/seller', key: 'menu.seller' },
  { href: '/support', key: 'menu.support' },
  { href: '/offer', key: 'footer.offer' },
  { href: '/privacy', key: 'footer.privacy' },
];

export function SiteFooter({ locale }: { locale: string }) {
  const t = createT(locale);
  return (
    <footer className={s.siteFooter}>
      <nav className={s.siteFooterLinks} aria-label={t('footer.title')}>
        {LINKS.map((link) => (
          <Link key={link.href} href={`/${locale}${link.href}`}>
            {t(link.key)}
          </Link>
        ))}
      </nav>
      <p className={s.siteFooterLine}>{t('footer.line')}</p>
    </footer>
  );
}
