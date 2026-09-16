'use client';
/**
 * The landing in three scrubbed acts — the row, the courier, the door — with
 * captions that appear at fixed points of each act, then a kraft sheet with
 * the rows to walk and the way into the app. Copy is inline: it is marketing
 * text, not product strings.
 */
import { useCallback } from 'react';

import styles from './promo.module.css';
import { ScrollFilm, reveal } from './scroll-film';

/** 8-second Seedance clips at 12 fps. */
const FRAMES = 96;
const pad = (i: number) => String(i + 1).padStart(3, '0');

const COPY = {
  ru: {
    signIn: 'Войти',
    act1: {
      eyebrow: 'Чорсу · утро · ряды с 6:30',
      title: 'Хуш келибсиз',
      line: '«Свежее с базара — как своими руками»',
      sign: ['Арбуз хорезмский', '25 000', 'шт', 'Дилноза-опа · павильон Б, место 7'],
      tag: 'взвесим при вас',
      pills: ['Взвесим при вас', 'Свежесть под гарантией', 'Можно поторговаться'],
      about: 'Продавцы, которых вы знаете по имени. Их прилавок — у вас в телефоне, с утра.',
    },
    act2: {
      eyebrow: 'Курьер из вашей махалли',
      title: '40 минут — и у двери',
      line: '«Шесть прилавков — одна корзина, один курьер»',
      stats: [
        ['40', 'минут от прилавка до двери'],
        ['6', 'прилавков в одной корзине'],
        ['1', 'курьер — свой, из махалли'],
      ],
      tail: 'Следите за ним на карте. Взвесили больше — вернём разницу на баланс.',
    },
    act3: {
      eyebrow: 'Клиенты довольны',
      title: 'Как будто сама сходила',
      quote: '«Арбуз выбрали, как для себя. Дочка теперь ждёт курьера, а не мультики»',
      who: 'Малика · Юнусабад · 47 заказов',
      rating: '4,9',
      ratingLabel: 'средняя оценка заказа',
      repeat: '8 из 10',
      repeatLabel: 'заказывают снова в течение недели',
    },
    paper: {
      title: 'Пройтись по ряду',
      line: 'выбирайте у людей, а не в каталоге',
      rows: [
        ['Овощи и зелень', 'Фарход-ака · Зелёный ряд', '6 товаров →'],
        ['Фрукты и ягоды', 'Дилноза-опа · Фруктовый павильон', '4 товара →'],
        ['Мясо и птица', 'Фархад · Мясной корпус', '3 товара →'],
        ['Хлеб и выпечка', 'Мунира-опа · тандыр с рассвета', '3 товара →'],
      ],
      cta: 'Открыть базар',
      app: 'Приложение для iPhone и Android',
      foot: 'Bazar Delivery · Чорсу · Алайский · Фархадский · Ташкент',
    },
  },
  uz: {
    signIn: 'Kirish',
    act1: {
      eyebrow: 'Chorsu · tong · rastalar 6:30 dan',
      title: 'Xush kelibsiz',
      line: '«Bozordan yangi — oʻz qoʻlingiz bilan olgandek»',
      sign: ['Xorazm tarvuzi', '25 000', 'dona', 'Dilnoza opa · B pavilyon, 7-joy'],
      tag: 'koʻz oldingizda tortamiz',
      pills: ['Koʻz oldingizda tortamiz', 'Yangiligi kafolatlangan', 'Savdolashish mumkin'],
      about: 'Ismini bilgan sotuvchilaringiz. Ularning peshtaxtasi — telefoningizda, ertalabdan.',
    },
    act2: {
      eyebrow: 'Mahallangizdan kuryer',
      title: '40 daqiqa — va eshik oldida',
      line: '«Olti peshtaxta — bitta savat, bitta kuryer»',
      stats: [
        ['40', 'daqiqa peshtaxtadan eshikkacha'],
        ['6', 'peshtaxta bitta savatda'],
        ['1', 'kuryer — oʻzimizniki, mahalladan'],
      ],
      tail: 'Uni xaritada kuzating. Koʻproq tortilsa — farqini balansga qaytaramiz.',
    },
    act3: {
      eyebrow: 'Mijozlar mamnun',
      title: 'Xuddi oʻzim borgandek',
      quote: '«Tarvuzni oʻzlariga olgandek tanlashdi. Qizim endi multfilm emas, kuryerni kutadi»',
      who: 'Malika · Yunusobod · 47 buyurtma',
      rating: '4,9',
      ratingLabel: 'buyurtmaning oʻrtacha bahosi',
      repeat: '10 dan 8',
      repeatLabel: 'bir hafta ichida yana buyurtma beradi',
    },
    paper: {
      title: 'Rasta boʻylab yuring',
      line: 'katalogdan emas, odamlardan tanlang',
      rows: [
        ['Sabzavot va koʻkatlar', 'Farhod aka · Yashil rasta', '6 ta mahsulot →'],
        ['Mevalar', 'Dilnoza opa · Meva pavilyoni', '4 ta mahsulot →'],
        ['Goʻsht va parranda', 'Farhad · Goʻsht korpusi', '3 ta mahsulot →'],
        ['Non va pishiriqlar', 'Munira opa · tongdan tandir', '3 ta mahsulot →'],
      ],
      cta: 'Bozorni ochish',
      app: 'iPhone va Android uchun ilova',
      foot: 'Bazar Delivery · Chorsu · Oloy · Farhod · Toshkent',
    },
  },
} as const;

export function PromoLanding({ locale }: { locale: string }) {
  const c = locale === 'uz' ? COPY.uz : COPY.ru;
  const act = useCallback((n: number) => (i: number) => `/promo/act${n}/${pad(i)}.webp`, []);
  const act1 = act(1);
  const act2 = act(2);
  const act3 = act(3);
  const home = `/${locale === 'uz' ? 'uz' : 'ru'}`;

  return (
    <main className={styles.page}>
      <header className={styles.bar}>
        <a href={home} className={styles.wordmark}>
          Bazar<b>.</b>
        </a>
        <a href={`${home}/login`} className={styles.barLink}>
          {c.signIn}
        </a>
      </header>

      {/* Act I — the row */}
      <ScrollFilm id="act-1" frames={FRAMES} src={act1} height={340}>
        {(p) => (
          <>
            <div className={styles.scrim} />
            <div className={styles.copy} style={reveal(p, 0, 0.3)}>
              <div className={styles.eyebrow}>{c.act1.eyebrow}</div>
              <h1 className={styles.display}>{c.act1.title}</h1>
              <div className={styles.line}>{c.act1.line}</div>
            </div>
            <div className={styles.copy} style={reveal(p, 0.36, 0.64)}>
              <div className={styles.tag}>{c.act1.tag}</div>
              <div className={styles.sign}>
                <div className={styles.signTitle}>{c.act1.sign[0]}</div>
                <div className={styles.signPrice}>
                  {c.act1.sign[1]} <small>сум / {c.act1.sign[2]}</small>
                </div>
                <div className={styles.signNote}>{c.act1.sign[3]}</div>
              </div>
            </div>
            <div className={styles.copy} style={reveal(p, 0.7, 1)}>
              <div className={styles.line} style={{ color: 'var(--cream)' }}>
                {c.act1.about}
              </div>
              <div className={styles.pills}>
                {c.act1.pills.map((pill) => (
                  <span key={pill} className={styles.pill}>
                    <i />
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </ScrollFilm>

      {/* Act II — the courier */}
      <ScrollFilm id="act-2" frames={FRAMES} src={act2} height={320}>
        {(p) => (
          <>
            <div className={styles.scrim} />
            <div className={`${styles.copy} ${styles.copyTop}`} style={reveal(p, 0, 0.38)}>
              <div className={styles.eyebrow}>{c.act2.eyebrow}</div>
              <h2 className={styles.display}>{c.act2.title}</h2>
              <div className={styles.line}>{c.act2.line}</div>
            </div>
            <div className={styles.copy} style={reveal(p, 0.44, 0.76)}>
              <div className={styles.stats}>
                {c.act2.stats.map(([n, label]) => (
                  <div key={label} className={styles.stat}>
                    <b>{n}</b>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.copy} style={reveal(p, 0.82, 1)}>
              <div className={styles.line} style={{ color: 'var(--cream)' }}>
                {c.act2.tail}
              </div>
            </div>
          </>
        )}
      </ScrollFilm>

      {/* Act III — the door */}
      <ScrollFilm id="act-3" frames={FRAMES} src={act3} height={320}>
        {(p) => (
          <>
            <div className={styles.scrim} />
            <div className={`${styles.copy} ${styles.copyTop}`} style={reveal(p, 0, 0.4)}>
              <div className={styles.eyebrow}>{c.act3.eyebrow}</div>
              <h2 className={styles.display}>{c.act3.title}</h2>
            </div>
            <div className={styles.copy} style={reveal(p, 0.46, 0.78)}>
              <div className={styles.receipt}>
                <div className={styles.quote}>{c.act3.quote}</div>
                <div className={styles.who}>
                  <span className={styles.stars}>★★★★★</span> {c.act3.who}
                </div>
              </div>
            </div>
            <div className={styles.copy} style={reveal(p, 0.84, 1)}>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <b>{c.act3.rating}</b>
                  <span>{c.act3.ratingLabel}</span>
                </div>
                <div className={styles.stat}>
                  <b>{c.act3.repeat}</b>
                  <span>{c.act3.repeatLabel}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </ScrollFilm>

      {/* The kraft sheet: walk a row, open the app */}
      <section id="rows" className={styles.paper}>
        <div className={styles.paperInner}>
          <div>
            <h2 className={`${styles.paperTitle} ${styles.serif}`}>{c.paper.title}</h2>
            <div className={styles.paperLine}>{c.paper.line}</div>
          </div>
          <div className={styles.rows}>
            {c.paper.rows.map(([name, who, count]) => (
              <a key={name} href={home} className={styles.row}>
                <span className={styles.rowSign}>{name}</span>
                <div className={styles.rowBody}>{who}</div>
                <div className={styles.rowCount}>{count}</div>
              </a>
            ))}
          </div>
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
