/**
 * A legal document as one long sheet of paper on the bazaar: the title in
 * serif, numbered sections, the details block at the end. Content comes from
 * `src/content/legal`.
 */
import Link from 'next/link';

import { ArrowLeft } from '@/components/go/icons';

import s from './bazar.module.css';

export interface LegalSection {
  title: string;
  paragraphs: readonly string[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  intro?: string;
  sections: readonly LegalSection[];
}

export function BazaarLegal({ doc, locale }: { doc: LegalDoc; locale: string }) {
  const home = `/${locale}`;
  return (
    <main className={s.scene}>
      <div className={`${s.body} ${s.narrow}`}>
        <div className={s.top}>
          <Link href={home} className={s.round} aria-label="Bazar">
            <ArrowLeft />
          </Link>
          <span className={s.tag}>{doc.updated}</span>
        </div>
        <div className={s.greeting} style={{ minHeight: 0, padding: '12px 0 26px' }}>
          <h1 className={s.display} style={{ fontSize: 'clamp(30px, 4.6vw, 48px)' }}>
            {doc.title}
          </h1>
          {doc.intro ? (
            <p
              className={s.hand}
              style={{
                fontSize: 22,
                margin: '8px 0 0',
                color: 'var(--cream-muted)',
                maxWidth: '44ch',
              }}
            >
              {doc.intro}
            </p>
          ) : null}
        </div>
        <article className={s.receipt} style={{ padding: '26px 26px 28px' }}>
          {doc.sections.map((section, i) => (
            <section key={section.title} className={s.legalSection}>
              <h2 className={s.legalTitle}>
                {i + 1}. {section.title}
              </h2>
              {section.paragraphs.map((p, j) => (
                <p key={j} className={s.legalText}>
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
