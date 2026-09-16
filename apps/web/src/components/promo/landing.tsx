'use client';
/**
 * The landing as one continuous film scrubbed by the scroll: the dome, the
 * row, into the bag, the road, the stairs, the door, the table — seven
 * Seedance shots whose first and last frames were generated to meet, so the
 * camera never cuts. Captions appear at fixed points of each shot; the bar
 * keeps the three chapters. After the film: what was on the table (the real
 * products), the app on a phone, and a kraft sheet with the way in. Copy is
 * inline: it is marketing text, not product strings.
 */
import { PHOTOS, photo } from '@bazar/storefront';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import styles from './promo.module.css';
import { ScrollFilm, reveal } from './scroll-film';

/** The shots in order: frames on disk (12 fps) and how many viewports of scroll each gets. */
const SEGMENTS = [
  { key: 'dome', frames: 96, vh: 240 },
  { key: 'row', frames: 96, vh: 320 },
  { key: 'bag', frames: 96, vh: 200 },
  { key: 'street', frames: 96, vh: 300 },
  { key: 'stairs', frames: 96, vh: 200 },
  { key: 'door', frames: 96, vh: 300 },
  { key: 'table', frames: 120, vh: 340 },
] as const;
type Key = (typeof SEGMENTS)[number]['key'];
const TOTAL_FRAMES = SEGMENTS.reduce((n, s) => n + s.frames, 0);
const TOTAL_VH = SEGMENTS.reduce((n, s) => n + s.vh, 0);
const pad = (i: number) => String(i + 1).padStart(3, '0');

/** Global progress at `local` (0..1) of a shot. */
function at(key: Key, local: number): number {
  let before = 0;
  for (const s of SEGMENTS) {
    if (s.key === key) return (before + local * s.vh) / TOTAL_VH;
    before += s.vh;
  }
  return 1;
}
/** Track progress → frame index, shot by shot. */
function toFrame(p: number): number {
  const pos = p * TOTAL_VH;
  let vh = 0;
  let frame = 0;
  for (const s of SEGMENTS) {
    if (pos <= vh + s.vh) return frame + ((pos - vh) / s.vh) * (s.frames - 1);
    vh += s.vh;
    frame += s.frames;
  }
  return TOTAL_FRAMES - 1;
}
/** Frame index → file, by shot. */
function frameSrc(size: 'd' | 'm', index: number): string {
  let i = index;
  for (const s of SEGMENTS) {
    if (i < s.frames) return `/promo/${size}/${s.key}/${pad(i)}.webp`;
    i -= s.frames;
  }
  return `/promo/${size}/table/${pad(119)}.webp`;
}

const CHAPTERS: { title: { ru: string; uz: string }; from: Key; to: Key }[] = [
  { title: { ru: 'Базар', uz: 'Bozor' }, from: 'dome', to: 'bag' },
  { title: { ru: 'Дорога', uz: 'Yoʻl' }, from: 'street', to: 'stairs' },
  { title: { ru: 'Дом', uz: 'Uy' }, from: 'door', to: 'table' },
];

const COPY = {
  ru: {
    signIn: 'Войти',
    scroll: 'листайте',
    dome: { eyebrow: 'Ташкент · Чорсу · 6:30', title: 'Хуш келибсиз', line: '«Базар начинается с купола»' },
    row: {
      sign: ['Арбуз хорезмский', '25 000', 'шт', 'Дилноза-опа · павильон Б, место 7'],
      tag: 'взвесим при вас',
      pills: ['Взвесим при вас', 'Свежесть под гарантией', 'Можно поторговаться'],
      about: 'Продавцы, которых вы знаете по имени. Их прилавок — у вас в телефоне, с утра.',
    },
    bag: { line: '«Взвесили — и сразу в пакет. Никаких складов»' },
    street: {
      eyebrow: 'Курьер из вашей махалли',
      title: '40 минут — и у двери',
      line: '«Шесть прилавков — одна корзина, один курьер»',
      stats: [
        ['40', 'минут от прилавка до двери'],
        ['6', 'прилавков в одной корзине'],
        ['1', 'курьер — свой, из махалли'],
      ],
    },
    stairs: { line: 'Следите за ним на карте. Взвесили больше — вернём разницу на баланс.' },
    door: {
      eyebrow: 'Клиенты довольны',
      title: 'Как будто сама сходила',
      quote: '«Арбуз выбрали, как для себя. Дочка теперь ждёт курьера, а не мультики»',
      who: 'Малика · Юнусабад · 47 заказов',
    },
    table: {
      eyebrow: 'Дастархан',
      title: 'Что было на столе',
      rating: '4,9',
      ratingLabel: 'средняя оценка заказа',
      repeat: '8 из 10',
      repeatLabel: 'заказывают снова в течение недели',
      hint: 'всё это — ниже, по ценам прилавка ↓',
    },
    products: {
      title: 'Что было на столе',
      line: 'те же прилавки, те же люди — на вашей кухне',
      items: [
        ['p-melon', 'Дыня мирзачульская', '45 000', 'шт', 'Дилноза-опа', '«Выбираю по хвостику»'],
        ['p-pomegranate', 'Гранат', '32 000', 'кг', 'Дилноза-опа', '«Тяжёлый — значит сочный»'],
        ['p-greens', 'Зелень, пучок', '4 000', 'шт', 'Фарход-ака', '«Режу на рассвете»'],
        ['p-obi-non', 'Оби нон, тандырный', '6 000', 'шт', 'Мунира-опа', '«Из тандыра с рассвета»'],
      ],
    },
    phone: {
      eyebrow: 'В приложении',
      title: 'Базар в кармане',
      screens: [
        ['Прилавки на главной', 'Большие фото, ценник от руки и слова продавца. «+» — и в корзине.'],
        ['Ценник как на Чорсу', 'Цена за кило, «осталось 8», гарантия взвешивания при вас.'],
        ['Чек с базара', 'Один чек на несколько прилавков, торг прямо в строке, кешбэк на баланс.'],
        ['Карта рядов', 'Вход, проход, прилавки по обе стороны — идите, как по базару.'],
      ],
    },
    paper: {
      title: 'Пройтись по ряду',
      line: 'выбирайте у людей, а не в каталоге',
      cta: 'Открыть базар',
      app: 'Приложение для iPhone и Android',
      foot: 'Bazar Delivery · Чорсу · Алайский · Фархадский · Ташкент',
    },
  },
  uz: {
    signIn: 'Kirish',
    scroll: 'varaqlang',
    dome: { eyebrow: 'Toshkent · Chorsu · 6:30', title: 'Xush kelibsiz', line: '«Bozor gumbazdan boshlanadi»' },
    row: {
      sign: ['Xorazm tarvuzi', '25 000', 'dona', 'Dilnoza opa · B pavilyon, 7-joy'],
      tag: 'koʻz oldingizda tortamiz',
      pills: ['Koʻz oldingizda tortamiz', 'Yangiligi kafolatlangan', 'Savdolashish mumkin'],
      about: 'Ismini bilgan sotuvchilaringiz. Ularning peshtaxtasi — telefoningizda, ertalabdan.',
    },
    bag: { line: '«Tortdik — va darrov xaltaga. Hech qanday ombor yoʻq»' },
    street: {
      eyebrow: 'Mahallangizdan kuryer',
      title: '40 daqiqa — va eshik oldida',
      line: '«Olti peshtaxta — bitta savat, bitta kuryer»',
      stats: [
        ['40', 'daqiqa peshtaxtadan eshikkacha'],
        ['6', 'peshtaxta bitta savatda'],
        ['1', 'kuryer — oʻzimizniki, mahalladan'],
      ],
    },
    stairs: { line: 'Uni xaritada kuzating. Koʻproq tortilsa — farqini balansga qaytaramiz.' },
    door: {
      eyebrow: 'Mijozlar mamnun',
      title: 'Xuddi oʻzim borgandek',
      quote: '«Tarvuzni oʻzlariga olgandek tanlashdi. Qizim endi multfilm emas, kuryerni kutadi»',
      who: 'Malika · Yunusobod · 47 buyurtma',
    },
    table: {
      eyebrow: 'Dasturxon',
      title: 'Dasturxonda nima bor edi',
      rating: '4,9',
      ratingLabel: 'buyurtmaning oʻrtacha bahosi',
      repeat: '10 dan 8',
      repeatLabel: 'bir hafta ichida yana buyurtma beradi',
      hint: 'hammasi — pastda, peshtaxta narxida ↓',
    },
    products: {
      title: 'Dasturxonda nima bor edi',
      line: 'oʻsha peshtaxtalar, oʻsha odamlar — sizning oshxonangizda',
      items: [
        ['p-melon', 'Mirzachoʻl qovuni', '45 000', 'dona', 'Dilnoza opa', '«Dumidan tanlayman»'],
        ['p-pomegranate', 'Anor', '32 000', 'kg', 'Dilnoza opa', '«Ogʻiri — sersuv»'],
        ['p-greens', 'Koʻkat, bogʻ', '4 000', 'dona', 'Farhod aka', '«Tongda oʻraman»'],
        ['p-obi-non', 'Obi non, tandir', '6 000', 'dona', 'Munira opa', '«Tongdan tandirdan»'],
      ],
    },
    phone: {
      eyebrow: 'Ilovada',
      title: 'Choʻntakdagi bozor',
      screens: [
        ['Bosh sahifada peshtaxtalar', 'Katta suratlar, qoʻlda yozilgan narx va sotuvchining soʻzi. «+» — va savatda.'],
        ['Chorsudagidek narx', 'Kilo narxi, «8 ta qoldi», koʻz oldingizda tortish kafolati.'],
        ['Bozor cheki', 'Bir necha peshtaxtaga bitta chek, qatorda savdolashish, balansga keshbek.'],
        ['Rastalar xaritasi', 'Kirish, yoʻlak, ikki tomonda peshtaxtalar — bozordagidek yuring.'],
      ],
    },
    paper: {
      title: 'Rasta boʻylab yuring',
      line: 'katalogdan emas, odamlardan tanlang',
      cta: 'Bozorni ochish',
      app: 'iPhone va Android uchun ilova',
      foot: 'Bazar Delivery · Chorsu · Oloy · Farhod · Toshkent',
    },
  },
} as const;

export function PromoLanding({ locale }: { locale: string }) {
  const uz = locale === 'uz';
  const c = uz ? COPY.uz : COPY.ru;
  const home = `/${uz ? 'uz' : 'ru'}`;
  // Phones get the 720-wide frames; everything else the 1280 set.
  const [size, setSize] = useState<'d' | 'm'>('d');
  useEffect(() => {
    setSize(window.innerWidth < 720 ? 'm' : 'd');
  }, []);
  const src = useCallback((i: number) => frameSrc(size, i), [size]);
  const [loaded, setLoaded] = useState(0);
  const [p, setP] = useState(0);
  const onLoad = useCallback((n: number, total: number) => setLoaded(n / total), []);
  const chapters = useMemo(
    () =>
      CHAPTERS.map((ch) => {
        const from = at(ch.from, 0);
        const to = at(ch.to, 1);
        return { ...ch, fill: Math.min(1, Math.max(0, (p - from) / (to - from))) };
      }),
    [p],
  );

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <a href={home} className={styles.wordmark}>
          Bazar<b>.</b>
        </a>
        <nav className={styles.chapters} aria-hidden>
          {chapters.map((ch, i) => (
            <span key={ch.from} className={styles.chapter}>
              <i style={{ transform: `scaleX(${ch.fill})` }} />
              <em>
                {['I', 'II', 'III'][i]} · {uz ? ch.title.uz : ch.title.ru}
              </em>
            </span>
          ))}
        </nav>
        <a href={`${home}/login`} className={styles.barLink}>
          {c.signIn}
        </a>
        <span className={styles.loader} style={{ transform: `scaleX(${loaded})`, opacity: loaded < 1 ? 1 : 0 }} />
      </header>

      <ScrollFilm id="film" frames={TOTAL_FRAMES} src={src} height={TOTAL_VH} toFrame={toFrame} onLoad={onLoad}>
        {(p) => <Film p={p} c={c} onP={setP} />}
      </ScrollFilm>

      {/* What was on the table — the real products, priced as on the counter */}
      <section id="table" className={styles.tableSection}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 className={styles.h2}>{c.products.title}</h2>
            <div className={styles.lineDark}>{c.products.line}</div>
          </div>
          <div className={styles.products}>
            {c.products.items.map(([id, name, price, unit, who, say], i) => (
              <a key={id} href={home} className={styles.product} style={{ transform: `rotate(${[-0.6, 0.5, -0.4, 0.6][i]}deg)` }}>
                <span className={styles.productPhoto} style={{ backgroundImage: `url(${photo(PHOTOS[id] ?? '', 960)})` }} />
                <span className={styles.productSign}>
                  <b>{name}</b>
                  <span className={styles.productPrice}>
                    {price} <small>сум / {unit}</small>
                  </span>
                  <span className={styles.productSay}>{say}</span>
                  <span className={styles.productWho}>{who}</span>
                  <span className={styles.productPlus}>+</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* The app on a phone: screens change as you scroll past */}
      <PhoneSection c={c} />

      {/* The kraft sheet: the way in */}
      <section id="rows" className={styles.paper}>
        <div className={styles.inner}>
          <h2 className={styles.paperTitle}>{c.paper.title}</h2>
          <div className={styles.paperLine}>{c.paper.line}</div>
          <div className={styles.ctaRow}>
            <a href={home} className={styles.cta}>
              {c.paper.cta}
            </a>
            <a href={home} className={`${styles.cta} ${styles.ctaPaper}`}>
              {c.paper.app}
            </a>
          </div>
          <div className={styles.foot}>{c.paper.foot}</div>
        </div>
      </section>
    </main>
  );
}

type Copy = (typeof COPY)['ru'] | (typeof COPY)['uz'];

/** The captions over the film, placed by shot. */
function Film({ p, c, onP }: { p: number; c: Copy; onP: (p: number) => void }) {
  useEffect(() => onP(p), [p, onP]);
  return (
    <>
      <div className={styles.scrim} />

      {/* dome */}
      <div className={`${styles.copy} ${styles.copyTop}`} style={reveal(p, 0, at('dome', 0.55))}>
        <div className={styles.eyebrow}>{c.dome.eyebrow}</div>
        <h1 className={styles.display}>{c.dome.title}</h1>
        <div className={styles.line}>{c.dome.line}</div>
      </div>
      <div className={styles.scrollHint} style={reveal(p, 0, at('dome', 0.12))}>
        <span>{c.scroll}</span>
        <i />
      </div>

      {/* row */}
      <div className={`${styles.copy} ${styles.copyRight}`} style={reveal(p, at('row', 0.3), at('row', 0.62))}>
        <div className={styles.tag}>{c.row.tag}</div>
        <div className={styles.sign}>
          <div className={styles.signTitle}>{c.row.sign[0]}</div>
          <div className={styles.signPrice}>
            {c.row.sign[1]} <small>сум / {c.row.sign[2]}</small>
          </div>
          <div className={styles.signNote}>{c.row.sign[3]}</div>
        </div>
      </div>
      <div className={styles.copy} style={reveal(p, at('row', 0.68), at('bag', 0.15))}>
        <div className={styles.line} style={{ color: 'var(--cream)' }}>
          {c.row.about}
        </div>
        <div className={styles.pills}>
          {c.row.pills.map((pill) => (
            <span key={pill} className={styles.pill}>
              <i />
              {pill}
            </span>
          ))}
        </div>
      </div>

      {/* bag */}
      <div className={styles.copy} style={reveal(p, at('bag', 0.3), at('bag', 0.85))}>
        <div className={styles.line}>{c.bag.line}</div>
      </div>

      {/* street */}
      <div className={`${styles.copy} ${styles.copyTop}`} style={reveal(p, at('street', 0.02), at('street', 0.42))}>
        <div className={styles.eyebrow}>{c.street.eyebrow}</div>
        <h2 className={styles.display}>{c.street.title}</h2>
        <div className={styles.line}>{c.street.line}</div>
      </div>
      <div className={styles.copy} style={reveal(p, at('street', 0.5), at('street', 0.96))}>
        <div className={styles.stats}>
          {c.street.stats.map(([n, label]) => (
            <div key={label} className={styles.stat}>
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* stairs */}
      <div className={`${styles.copy} ${styles.copyCenter}`} style={reveal(p, at('stairs', 0.25), at('stairs', 0.9))}>
        <div className={styles.line} style={{ color: 'var(--cream)' }}>
          {c.stairs.line}
        </div>
      </div>

      {/* door */}
      <div className={`${styles.copy} ${styles.copyTop}`} style={reveal(p, at('door', 0.02), at('door', 0.45))}>
        <div className={styles.eyebrow}>{c.door.eyebrow}</div>
        <h2 className={styles.display}>{c.door.title}</h2>
      </div>
      <div className={`${styles.copy} ${styles.copyRight}`} style={reveal(p, at('door', 0.5), at('door', 0.98))}>
        <div className={styles.receipt}>
          <div className={styles.quote}>{c.door.quote}</div>
          <div className={styles.who}>
            <span className={styles.stars}>★★★★★</span> {c.door.who}
          </div>
        </div>
      </div>

      {/* table */}
      <div className={styles.copy} style={reveal(p, at('table', 0.3), at('table', 0.78))}>
        <div className={styles.eyebrow}>{c.table.eyebrow}</div>
        <div className={styles.stats}>
          <div className={styles.stat}>
            <b>{c.table.rating}</b>
            <span>{c.table.ratingLabel}</span>
          </div>
          <div className={styles.stat}>
            <b>{c.table.repeat}</b>
            <span>{c.table.repeatLabel}</span>
          </div>
        </div>
      </div>
      <div className={`${styles.copy} ${styles.copyCenter}`} style={reveal(p, at('table', 0.84), 1)}>
        <h2 className={styles.display}>{c.table.title}</h2>
        <div className={styles.line}>{c.table.hint}</div>
      </div>
    </>
  );
}

/** A phone pinned while four screens of the app pass through it. */
function PhoneSection({ c }: { c: Copy }) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const travel = rect.height - window.innerHeight;
        setP(Math.min(1, Math.max(0, travel > 0 ? -rect.top / travel : 0)));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  const screens = ['home', 'product', 'cart', 'map'];
  const n = screens.length;
  const active = Math.min(n - 1, Math.floor(p * n));
  return (
    <section id="app" ref={ref} className={styles.phoneTrack}>
      <div className={styles.phoneSticky}>
        <div className={styles.phoneCopy}>
          <div className={styles.eyebrowDark}>{c.phone.eyebrow}</div>
          <h2 className={styles.h2}>{c.phone.title}</h2>
          <ol className={styles.phoneList}>
            {c.phone.screens.map(([title, text], i) => (
              <li key={title} className={i === active ? styles.phoneItemOn : styles.phoneItem}>
                <b>{title}</b>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className={styles.phone} style={{ transform: `translateY(${(1 - Math.min(1, p * 4)) * 40}px) rotate(${-2 + p * 2}deg)` }}>
          <div className={styles.phoneScreen}>
            {screens.map((s, i) => (
              <img key={s} src={`/promo/app/${s}.jpg`} alt="" style={{ opacity: i === active ? 1 : 0 }} />
            ))}
          </div>
          <span className={styles.phoneIsland} />
        </div>
      </div>
    </section>
  );
}
