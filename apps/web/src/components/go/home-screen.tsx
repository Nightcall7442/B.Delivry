/**
 * Home as a marketplace: the promise and the season up top, categories as
 * photo tiles, the stalls, this morning's counters, deals, sets, and the long
 * tail — «Подобрали для вас». The map moved to the address picker.
 */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { CategoryDto, ProductDto } from '@bazar/types';
import {
  activeHoliday,
  arrivedToday,
  bundlesFor,
  categoryPhotoUrl,
  currentSeason,
  estimateDelivery,
  getBundle,
  type Holiday,
  holidayDaysLeft,
  type MapStoreDto,
  PHOTOS,
  photo,
  tashkentDate,
  tr,
} from '@bazar/storefront';
import { createT } from '@bazar/i18n';
import { useEffect, useMemo, useState } from 'react';

import { GoShell } from '@/components/go/go-shell';
import { Basket, ListGlyph, Repeat, Star, Tag } from '@/components/go/icons';
import { rememberReferral } from '@/components/go/invite-screen';
import { BundleRail } from '@/components/go/bundle-rail';
import { OrderBanner } from '@/components/go/order-banner';
import { ProductTile } from '@/components/go/product-tile';
import { Photo } from '@/components/go/photo';
import { promoted, StoreCard } from '@/components/go/store-row';
import { Stories } from '@/components/go/stories';
import { useAddress } from '@/features/address';

export function HomeScreen({
  stores,
  categories,
  products,
  locale,
}: {
  stores: readonly MapStoreDto[];
  categories: readonly CategoryDto[];
  products: readonly ProductDto[];
  locale: string;
}) {
  const t = createT(locale);
  // A shared invite link lands here; the code waits for sign-in on the invite screen.
  useEffect(() => {
    rememberReferral(new URLSearchParams(window.location.search).get('ref'));
  }, []);
  const { address } = useAddress();
  // Which hero the phone carousel is on (the dots under it).
  const [slide, setSlide] = useState(0);
  // `?holiday=navruz` previews a card before its window (marketing checks it).
  const holiday = activeHoliday(new Date(), useSearchParams().get('holiday'));
  const holidayEyebrow = (h: Holiday) => {
    const days = holidayDaysLeft(h);
    const today = tashkentDate();
    if (h.from > today) return t('holiday.soon', { date: t.date(`${h.from}T00:00:00+05:00`) });
    return days === 0 ? t('holiday.lastDay') : t('holiday.daysLeft', { days });
  };
  const season = currentSeason(new Date());
  const seasonCategory = categories.find((c) => c.slug === season.category);
  const chorsu = stores.find((store) => store.slug === 'chorsu-zelen') ?? stores[0];

  const ranked = useMemo(() => {
    const withEta = stores.map((store) => ({
      store,
      eta: address
        ? estimateDelivery(store.point, address.point, store.preparationMinutes).etaMinutes
        : null,
    }));
    const byEta = address ? withEta.sort((a, b) => (a.eta ?? 0) - (b.eta ?? 0)) : withEta;
    return [...byEta].sort((a, b) => Number(promoted(b.store)) - Number(promoted(a.store)));
  }, [stores, address]);
  const deals = useMemo(() => {
    const fresh = products.filter((p) => p.available && arrivedToday(p));
    const cheaper = products.filter((p) => p.available && p.oldPrice && !arrivedToday(p));
    return [...fresh, ...cheaper].slice(0, 10);
  }, [products]);
  const tape = useMemo(
    () =>
      products
        .filter((p) => p.available && (p.oldPrice || arrivedToday(p)))
        .slice(0, 12)
        .map((p) => ({
          id: p.id,
          name: tr(p.name, locale),
          price: t.money(p.price.amount),
          delta: p.oldPrice ? Math.round((1 - p.price.amount / p.oldPrice.amount) * 100) : null,
          fresh: arrivedToday(p),
        })),
    [products, locale, t],
  );
  const feed = useMemo(
    () =>
      [...products]
        .filter((p) => p.available)
        .sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
        .slice(0, 20),
    [products],
  );

  const heroes = [
    ...(holiday
      ? [
          {
            id: 'holiday',
            href: `/${locale}/bundles/${holiday.bundleSlug}`,
            eyebrow: holidayEyebrow(holiday),
            title: tr(holiday.title, locale),
            hint: tr(holiday.hint, locale),
            image: getBundle(holiday.bundleSlug)?.photo ?? '',
          },
        ]
      : []),
    {
      id: 'promo',
      href: `/${locale}/stores/${chorsu?.id ?? ''}`,
      eyebrow: t('home.promoEyebrow'),
      title: t('home.promoTitle'),
      hint: t('home.promoHint'),
      image: chorsu?.counterPhotoUrl ?? PHOTOS['promo-chorsu'] ?? '',
    },
    {
      id: 'season',
      href: `/${locale}/catalog${seasonCategory ? `?category=${seasonCategory.id}` : ''}`,
      eyebrow: t('home.seasonEyebrow'),
      title: tr(season.title, locale),
      hint: tr(season.hint, locale),
      image: PHOTOS[season.photo] ?? '',
    },
  ].slice(0, 2);
  const quick = [
    { key: 'deals', label: t('home.deals'), href: '#deals', icon: <Tag size={16} /> },
    { key: 'bundles', label: t('home.bundles'), href: '#bundles', icon: <Basket size={16} /> },
    { key: 'list', label: t('menu.list'), href: `/${locale}/list`, icon: <ListGlyph size={16} /> },
    {
      key: 'subs',
      label: t('menu.subscriptions'),
      href: `/${locale}/subscriptions`,
      icon: <Repeat size={16} />,
    },
    { key: 'plus', label: t('menu.plus'), href: `/${locale}/plus`, icon: <Star size={16} /> },
  ];

  return (
    <GoShell locale={locale}>
      <OrderBanner locale={locale} />

      {tape.length > 0 ? (
        <div
          className="tile mt-2 flex h-9 items-center overflow-hidden rounded-xl"
          aria-label={t('ticker.title')}
        >
          <span className="flex h-full shrink-0 items-center rounded-xl bg-brand-600 px-3 text-[10px] font-extrabold uppercase tracking-[0.1em] text-white">
            {t('ticker.title')}
          </span>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="marquee flex w-max">
              {[0, 1].map((copy) => (
                <div key={copy} className="flex items-center pl-3" aria-hidden={copy === 1}>
                  {tape.map((item) => (
                    <Link
                      key={`${copy}-${item.id}`}
                      href={`/${locale}/catalog?q=${encodeURIComponent(item.name)}`}
                      className="mr-6 flex items-center gap-1.5 whitespace-nowrap text-xs"
                    >
                      <span className="font-semibold">{item.name}</span>
                      <span className="font-bold tabular-nums">{item.price}</span>
                      {item.delta ? (
                        <span className="font-bold text-danger">▼ {item.delta}%</span>
                      ) : item.fresh ? (
                        <span className="font-bold text-brand-700">● {t('store.todayBadge')}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 md:grid md:grid-cols-12 md:grid-rows-2 md:gap-3">
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:contents [&::-webkit-scrollbar]:hidden"
          onScroll={(event) => {
            const el = event.currentTarget;
            const card = el.firstElementChild as HTMLElement | null;
            if (card) setSlide(Math.round(el.scrollLeft / (card.offsetWidth + 8)));
          }}
        >
          {heroes.map((hero, i) => (
            <Link
              key={hero.id}
              href={hero.href}
              className={`group relative block w-[82%] shrink-0 snap-start overflow-hidden rounded-3xl bg-surface-soft text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 md:w-auto ${i === 0 ? 'md:col-span-7 md:row-span-2 md:min-h-[420px]' : 'md:col-span-5 md:min-h-[204px]'}`}
            >
              <Image
                src={photo(hero.image, 960)}
                alt=""
                fill
                sizes="(min-width: 768px) 700px, 100vw"
                priority={i === 0}
                unoptimized
                className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-[#0b1330]/85 via-[#0b1330]/30 to-transparent" />
              <span
                className={`relative flex h-full min-h-[188px] flex-col justify-end p-4 md:p-5 ${i === 0 ? 'md:min-h-[420px] md:p-7' : 'md:min-h-[204px]'}`}
              >
                <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-white/85">
                  {hero.eyebrow}
                </span>
                <span
                  className={`mt-1 font-display font-extrabold [text-wrap:balance] ${i === 0 ? 'text-2xl leading-7 md:text-4xl md:leading-10' : 'text-xl leading-6 md:text-2xl md:leading-7'}`}
                >
                  {hero.title}
                </span>
                <span className="mt-1.5 flex items-end justify-between gap-3 md:mt-2">
                  <span className="line-clamp-2 text-[13px] text-white/80 md:text-sm">
                    {hero.hint}
                  </span>
                  {/* The whole card is the link; the pill is a desktop affordance. */}
                  <span className="hidden shrink-0 rounded-full bg-white px-4 py-2 text-sm font-bold text-brand-deep md:inline">
                    {t('home.shopNow')}
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>
        {heroes.length > 1 ? (
          <div className="mt-2 flex justify-center gap-1.5 md:hidden" aria-hidden>
            {heroes.map((hero, i) => (
              <span
                key={hero.id}
                className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-4 bg-brand-600' : 'w-1.5 bg-line'}`}
              />
            ))}
          </div>
        ) : null}
        <div className="mt-6 md:col-span-5 md:mt-0 md:min-h-[204px] md:tile md:p-4">
          <div className="mb-3 flex flex-col gap-0.5 md:flex-row md:items-baseline md:justify-between md:gap-3">
            <h2 className="font-display text-lg font-extrabold">{t('home.live')}</h2>
            <span className="text-[13px] font-medium text-brand-600 md:text-xs">
              {t('home.storiesHint')}
            </span>
          </div>
          <Stories stores={ranked.map(({ store }) => store)} locale={locale} />
        </div>
      </div>

      {/* Quick row: the app's own paths that otherwise hide in the menu. */}
      <nav
        className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
        aria-label={t('menu.home')}
      >
        {quick.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-soft pl-2.5 pr-3.5 text-[13px] font-semibold transition-colors hover:bg-surface-mute"
          >
            <span className="text-brand-600">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <Section
        title={t('home.categories')}
        href={`/${locale}/catalog`}
        action={t('common.all')}
        locale={locale}
      >
        <ul className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
          {categories.slice(0, 6).map((category) => (
            <li key={category.id}>
              <Link
                href={`/${locale}/catalog?category=${category.id}`}
                className="tile group block p-1.5 transition-transform hover:-translate-y-0.5"
              >
                <Photo
                  src={categoryPhotoUrl(category.slug, 500)}
                  alt=""
                  sizes="(min-width: 768px) 190px, 33vw"
                  className="aspect-[4/3] rounded-2xl"
                />
                <span className="block px-1.5 pb-1 pt-2 text-xs font-bold leading-4 md:text-sm">
                  {tr(category.name, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('home.stores')} locale={locale}>
        <Rail>
          {ranked.map(({ store, eta }) => (
            <StoreCard key={store.id} store={store} locale={locale} etaMinutes={eta} />
          ))}
        </Rail>
      </Section>

      {deals.length > 0 ? (
        <Section
          id="deals"
          title={t('home.deals')}
          href={`/${locale}/catalog`}
          action={t('common.all')}
          locale={locale}
        >
          <Rail>
            {deals.map((product) => (
              <div key={product.id} className="w-40 shrink-0 md:w-48">
                <ProductTile product={product} locale={locale} />
              </div>
            ))}
          </Rail>
        </Section>
      ) : null}

      <BundleRail locale={locale} bundles={bundlesFor(new Date(), holiday?.key)} />

      <Section title={t('home.forYou')} locale={locale}>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 lg:grid-cols-5">
          {feed.map((product) => (
            <li key={product.id}>
              <ProductTile product={product} locale={locale} />
            </li>
          ))}
        </ul>
      </Section>
    </GoShell>
  );
}

function Section({
  id,
  title,
  hint,
  href,
  action,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  href?: string;
  action?: string;
  locale: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-6 scroll-mt-20 md:mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight md:text-2xl">
          {title}
          {hint ? <span className="ml-2 text-sm font-medium text-brand-600">{hint}</span> : null}
        </h2>
        {href && action ? (
          <Link href={href} className="text-sm font-medium text-brand-600">
            {action}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:gap-3 md:px-0 [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
