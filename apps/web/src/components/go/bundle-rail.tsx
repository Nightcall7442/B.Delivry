/**
 * "К столу": the recipe sets on the home sheet. Photo first — a plov sells
 * itself, a list of ingredients does not.
 */
import { BUNDLES, type Bundle, photo, tr } from '@bazar/storefront';
import { createT } from '@bazar/i18n';
import Image from 'next/image';
import Link from 'next/link';

export function BundleRail({
  locale,
  bundles = BUNDLES,
}: {
  locale: string;
  bundles?: readonly Bundle[];
}) {
  const t = createT(locale);
  return (
    <section id="bundles" className="mt-6 scroll-mt-20 md:mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight md:text-2xl">
          {t('home.bundles')}
        </h2>
        <span className="text-xs text-ink-muted">{t('home.bundlesHint')}</span>
      </div>
      <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:gap-3 md:px-0 [&::-webkit-scrollbar]:hidden">
        {bundles.map((bundle) => (
          <Link
            key={bundle.slug}
            href={`/${locale}/bundles/${bundle.slug}`}
            className="relative block h-36 w-40 shrink-0 snap-start overflow-hidden rounded-2xl bg-brand-950 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
          >
            <Image
              src={photo(bundle.photo, 500)}
              alt=""
              fill
              sizes="160px"
              unoptimized
              className="object-cover opacity-90"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-brand-950/90 via-brand-950/20 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-3">
              <span className="block font-display text-sm font-extrabold leading-4">
                {tr(bundle.title, locale)}
              </span>
              <span className="mt-0.5 block text-[11px] text-white/75">
                {t('home.serves', { count: bundle.serves })}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
