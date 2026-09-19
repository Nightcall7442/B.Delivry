'use client';

import {
  CASHBACK,
  PROMOTION,
  STORE_TAG,
  STORE_TYPE,
  type StoreTag,
  type StoreType,
} from '@bazar/constants';
import { arrivedToday, isShopfront, tagLabel, tr } from '@bazar/storefront';
import type { HaggleDto, ProductDto, SalesReportDto, StoreDto } from '@bazar/types';
import { formatMoney } from '@bazar/utils/money';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Demand } from '@/features/demand';
import { api } from '@/lib/api';

type Tab = 'products' | 'import' | 'arrivals' | 'haggle' | 'revenue' | 'demand';

export default function StorePage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [tab, setTab] = useState<Tab>('products');
  const [store, setStore] = useState<StoreDto | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = () => {
    api()
      .stores.get(storeId)
      .then(setStore)
      .catch(() => undefined);
    api()
      .catalog.products({ storeId, pageSize: 100 })
      .then((page) => setProducts(page.items))
      .catch(() => undefined);
  };
  useEffect(load, [storeId]);

  const say = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(null), 2500);
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-extrabold">{store ? tr(store.name, 'ru') : '…'}</h1>
      <p className="mt-1 text-sm text-ink-muted">{store?.address}</p>

      {store ? <CounterPhoto store={store} onChange={load} say={say} /> : null}
      {store && !isShopfront(store) ? <Owner store={store} onChange={load} say={say} /> : null}
      {store ? <Promotion store={store} onChange={load} say={say} /> : null}
      {store ? <Tags store={store} onChange={load} say={say} /> : null}
      {store ? <Shop store={store} onChange={load} say={say} /> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ['products', 'Товары'],
            ['import', 'Импорт CSV'],
            ['arrivals', 'Сегодня привезли'],
            ['haggle', 'Торг'],
            ['revenue', 'Выручка'],
            ['demand', 'Спрос'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={tab === key ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {note ? <p className="mt-2 text-sm text-brand-700">{note}</p> : null}

      {tab === 'products' ? <Products products={products} onChange={load} say={say} /> : null}
      {tab === 'import' ? <ImportCsv storeId={storeId} onChange={load} say={say} /> : null}
      {tab === 'arrivals' ? (
        <Arrivals storeId={storeId} products={products} onChange={load} say={say} />
      ) : null}
      {tab === 'haggle' ? <Haggle storeId={storeId} say={say} /> : null}
      {tab === 'revenue' ? <Revenue storeId={storeId} /> : null}
      {/* Demand is bazaar-wide on purpose: a gap nobody fills is the vendor's opportunity. */}
      {tab === 'demand' ? <Demand /> : null}
    </div>
  );
}

/** Shops: the chain, its own order limits and hours; stalls leave this alone. */
function Shop({
  store,
  onChange,
  say,
}: {
  store: StoreDto;
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [type, setType] = useState<StoreType>(store.type);
  const [chain, setChain] = useState(store.chainSlug ?? '');
  const [minOrder, setMinOrder] = useState(store.minOrder ? String(store.minOrder / 100) : '');
  const [freeFrom, setFreeFrom] = useState(
    store.freeDeliveryThreshold ? String(store.freeDeliveryThreshold / 100) : '',
  );
  const today = store.schedule[0];
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const [opens, setOpens] = useState(today ? clock(today.opensAt) : '08:00');
  const [closes, setCloses] = useState(today ? clock(today.closesAt) : '23:00');
  const [busy, setBusy] = useState(false);
  const minutes = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const soum = (value: string) =>
    value.trim() === '' ? null : Math.round(Number(value.replace(',', '.')) * 100);
  // The board over the door: the chain's logo where a stall would have a face.
  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await api().uploads.image('store-images', file, file.type || 'image/jpeg');
      await api().stores.update(store.id, { logoUrl: uploaded.url });
      say('Логотип обновлён — он на вывеске у покупателя');
      onChange();
    } catch {
      say('Логотип не загрузился');
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      await api().stores.update(store.id, {
        type,
        chainSlug: chain.trim() || null,
        minOrder: soum(minOrder),
        freeDeliveryThreshold: soum(freeFrom),
        schedule: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          opensAt: minutes(opens),
          closesAt: minutes(closes),
          closed: false,
        })),
      });
      say('Сохранено — покупатели видят часы и условия на витрине');
      onChange();
    } catch (cause) {
      say(cause instanceof Error ? cause.message : 'Не сохранилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center gap-4">
        {store.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.logoUrl} alt="" className="h-12 w-12 rounded-lg object-contain" />
        ) : null}
        <div className="flex-1">
          <div className="font-medium">Магазин</div>
          <div className="text-xs text-ink-muted">
            Тип точки, сеть (филиалы одной сети — одна витрина, заказ уходит в ближайший), свои
            минимальный заказ и порог бесплатной доставки, часы работы на каждый день. Логотип стоит
            на вывеске вместо лица продавца.
          </div>
        </div>
        <label className={`btn-secondary cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          Логотип
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void uploadLogo(e.target.files?.[0])}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select
          className="field"
          value={type}
          onChange={(e) => setType(e.target.value as StoreType)}
        >
          {Object.values(STORE_TYPE).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input
          className="field"
          value={chain}
          onChange={(e) => setChain(e.target.value.toLowerCase())}
          placeholder="Сеть: korzinka"
          maxLength={40}
        />
        <div className="flex items-center gap-2">
          <input
            className="field tabular-nums"
            type="time"
            value={opens}
            onChange={(e) => setOpens(e.target.value)}
          />
          <span className="text-ink-muted">—</span>
          <input
            className="field tabular-nums"
            type="time"
            value={closes}
            onChange={(e) => setCloses(e.target.value)}
          />
        </div>
        <input
          className="field tabular-nums"
          value={minOrder}
          onChange={(e) => setMinOrder(e.target.value)}
          placeholder="Минимальный заказ, сум"
          inputMode="numeric"
        />
        <input
          className="field tabular-nums"
          value={freeFrom}
          onChange={(e) => setFreeFrom(e.target.value)}
          placeholder="Бесплатная доставка от, сум"
          inputMode="numeric"
        />
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          Сохранить
        </button>
      </div>
    </div>
  );
}

/** The whole shelf from one spreadsheet; re-uploads update prices and stock by name. */
function ImportCsv({
  storeId,
  onChange,
  say,
}: {
  storeId: string;
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    skipped: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (file) setCsv(await file.text());
  };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api().stores.importProducts(storeId, csv);
      setResult(r);
      say(`Добавлено ${r.created}, обновлено ${r.updated}, пропущено ${r.skipped.length}`);
      onChange();
    } catch (cause) {
      say(cause instanceof Error ? cause.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3">
      <p className="text-sm text-ink-muted">
        Колонки:{' '}
        <code>name_ru;name_uz;price;unit;category;image_url;stock;weight_grams;old_price</code> —
        разделитель любой (табуляция, «;» или «,»), первая строка — заголовок. Цена в сумах, вес в
        граммах, категория — слаг (dairy, grocery…). Строки без фото и с алкоголем/табаком
        пропускаются. Повторная загрузка обновляет цены и остатки по названию.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="btn-secondary cursor-pointer">
          Выбрать файл
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || csv.trim() === ''}
          onClick={() => void submit()}
        >
          Загрузить
        </button>
      </div>
      <textarea
        className="field mt-3 min-h-[200px] w-full font-mono text-xs"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={
          'name_ru;price;unit;category;image_url\nМолоко 3.2%, 1 л;12500;PCS;dairy;https://…'
        }
      />
      {result ? (
        <div className="card mt-3 p-4 text-sm">
          <div>
            Добавлено <b>{result.created}</b>, обновлено <b>{result.updated}</b>, пропущено{' '}
            <b>{result.skipped.length}</b>
          </div>
          {result.skipped.length > 0 ? (
            <div className="mt-2 text-xs text-ink-muted">
              Пропущено (строка: причина): {result.skipped.join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Paid placement: a week on top of the home list, paid like Plus — Payme/Click or the wallet. */
function Promotion({
  store,
  onChange,
  say,
}: {
  store: StoreDto;
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const live = store.promotedUntil !== null && Date.parse(store.promotedUntil) > Date.now();
  const buy = async (method: 'BALANCE' | 'ONLINE', provider?: 'payme' | 'click') => {
    setBusy(true);
    try {
      const payment = await api().payments.promote(store.id, {
        method,
        ...(provider ? { provider } : {}),
        returnUrl: window.location.href,
      });
      if (payment.confirmationUrl) window.location.href = payment.confirmationUrl;
      else if (payment.status === 'CAPTURED') {
        say('Оплачено — точка поднята');
        onChange();
      } else say(`Платёж: ${payment.status}`);
    } catch (cause) {
      say(cause instanceof Error ? cause.message : 'Не получилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mt-3 flex flex-wrap items-center gap-3 p-4">
      <div className="flex-1">
        <div className="font-medium">Реклама: первое место на главной</div>
        <div className="text-xs text-ink-muted">
          {live
            ? `Поднята до ${new Date(store.promotedUntil!).toLocaleDateString('ru-RU')} · пометка «Реклама» у покупателя`
            : `${PROMOTION.DAYS} дней первым в списке точек за ${formatMoney(PROMOTION.PRICE_MINOR)}`}
        </div>
      </div>
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={() => void buy('BALANCE')}
      >
        С баланса
      </button>
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => void buy('ONLINE', 'payme')}
      >
        Payme
      </button>
      <button
        type="button"
        className="btn-primary"
        disabled={busy}
        onClick={() => void buy('ONLINE', 'click')}
      >
        Click
      </button>
    </div>
  );
}

/** Badges the customer sees on the stall: eco, halal, homemade, gift. */
function Tags({
  store,
  onChange,
  say,
}: {
  store: StoreDto;
  onChange: () => void;
  say: (text: string) => void;
}) {
  const labels = tagLabel('ru');
  const toggle = async (tag: StoreTag) => {
    const next = store.tags.includes(tag)
      ? store.tags.filter((t) => t !== tag)
      : [...store.tags, tag];
    try {
      await api().stores.update(store.id, { tags: next });
      onChange();
    } catch {
      say('Не сохранилось');
    }
  };
  return (
    <div className="card mt-3 flex flex-wrap items-center gap-2 p-4">
      <span className="mr-2 text-sm font-medium">Бейджи точки</span>
      {Object.values(STORE_TAG).map((tag) => (
        <button
          key={tag}
          type="button"
          className={`badge ${store.tags.includes(tag) ? 'badge-ok' : ''}`}
          onClick={() => void toggle(tag)}
        >
          {labels[tag]}
        </button>
      ))}
    </div>
  );
}

/** "За прилавком": the person the customer sees on the stall page — name, first year here, a line, a photo. */
function Owner({
  store,
  onChange,
  say,
}: {
  store: StoreDto;
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [name, setName] = useState(store.ownerName ?? '');
  const [since, setSince] = useState(store.ownerSince ? String(store.ownerSince) : '');
  const [mottoRu, setMottoRu] = useState(store.ownerMotto?.ru ?? '');
  const [mottoUz, setMottoUz] = useState(store.ownerMotto?.uz ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api().stores.update(store.id, {
        ownerName: name.trim() || null,
        ownerSince: since.trim() ? Number(since) : null,
        ownerMotto:
          mottoRu.trim() || mottoUz.trim() ? { ru: mottoRu.trim(), uz: mottoUz.trim() } : null,
      });
      say('Сохранено — покупатели видят это на странице точки');
      onChange();
    } catch {
      say('Не сохранилось');
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await api().uploads.image('store-images', file, file.type || 'image/jpeg');
      await api().stores.update(store.id, { ownerPhotoUrl: uploaded.url });
      onChange();
    } catch {
      say('Фото не загрузилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mt-3 p-4">
      <div className="flex items-center gap-4">
        {store.ownerPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.ownerPhotoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">
            {(name || '?').slice(0, 1)}
          </div>
        )}
        <div className="flex-1">
          <div className="font-medium">За прилавком</div>
          <div className="text-xs text-ink-muted">
            Имя, с какого года на базаре и одна фраза в ваших словах — так покупатель узнаёт, у кого
            берёт.
          </div>
        </div>
        <label className={`btn-secondary cursor-pointer ${busy ? 'opacity-50' : ''}`}>
          Фото
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void upload(e.target.files?.[0])}
          />
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Имя, как вас зовут покупатели: Фарход-ака"
          maxLength={80}
        />
        <input
          className="field tabular-nums"
          value={since}
          onChange={(e) => setSince(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="С года"
          inputMode="numeric"
        />
        <input
          className="field sm:col-span-2"
          value={mottoRu}
          onChange={(e) => setMottoRu(e.target.value)}
          placeholder="Фраза по-русски: «Зелень режу на рассвете — к обеду её уже нет»"
          maxLength={140}
        />
        <input
          className="field sm:col-span-2"
          value={mottoUz}
          onChange={(e) => setMottoUz(e.target.value)}
          placeholder="Oʻzbekcha: «Koʻkatni tongda oʻraman — tushga qolmaydi»"
          maxLength={140}
        />
      </div>
      <div className="mt-3">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>
          Сохранить
        </button>
      </div>
    </div>
  );
}

/** "Прилавок сейчас": one photo a morning, dated by the server. */
function CounterPhoto({
  store,
  onChange,
  say,
}: {
  store: StoreDto;
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const uploaded = await api().uploads.image('store-images', file, file.type || 'image/jpeg');
      await api().stores.update(store.id, { counterPhotoUrl: uploaded.url });
      say('Фото прилавка обновлено — покупатели видят его на странице точки');
      onChange();
    } catch {
      say('Фото не загрузилось');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card mt-4 flex items-center gap-4 p-4">
      {store.counterPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={store.counterPhotoUrl} alt="" className="h-20 w-28 rounded-lg object-cover" />
      ) : (
        <div className="flex h-20 w-28 items-center justify-center rounded-lg bg-sand-100 text-xs text-ink-muted">
          нет фото
        </div>
      )}
      <div className="flex-1">
        <div className="font-medium">Прилавок сейчас</div>
        <div className="text-xs text-ink-muted">
          {store.counterPhotoAt
            ? `Снято ${new Date(store.counterPhotoAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : 'Сфотографируйте витрину утром — это живая витрина для покупателя.'}
        </div>
      </div>
      <label className={`btn-secondary cursor-pointer ${busy ? 'opacity-50' : ''}`}>
        Загрузить фото
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function Products({
  products,
  onChange,
  say,
}: {
  products: ProductDto[];
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { price: string; stock: string }>>({});
  const draft = (product: ProductDto) =>
    drafts[product.id] ?? {
      price: String(product.price.amount / 100),
      stock: product.stock === null ? '' : String(product.stock),
    };

  const save = async (product: ProductDto) => {
    const d = draft(product);
    const price = Math.round(Number(d.price.replace(',', '.')) * 100);
    if (!Number.isFinite(price) || price <= 0) return say('Цена должна быть числом');
    try {
      await api().catalog.updateProduct(product.id, {
        price: { amount: price, currency: product.price.currency },
        ...(d.stock.trim() === '' ? {} : { stock: Number(d.stock) }),
      });
      say(`${tr(product.name, 'ru')}: сохранено`);
      onChange();
    } catch {
      say('Не сохранилось');
    }
  };
  const toggle = async (product: ProductDto) => {
    try {
      await api().catalog.setAvailability(product.id, !product.available);
      onChange();
    } catch {
      say('Не удалось изменить');
    }
  };
  const photo = async (product: ProductDto, file: File | undefined) => {
    if (!file) return;
    try {
      const uploaded = await api().uploads.image('product-images', file, file.type || 'image/jpeg');
      await api().catalog.updateProduct(product.id, {
        images: [{ url: uploaded.url }, ...product.images.slice(0, 4).map((i) => ({ url: i.url }))],
      });
      say('Фото обновлено');
      onChange();
    } catch {
      say('Фото не загрузилось');
    }
  };

  return (
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-ink-muted">
          <tr>
            <th className="px-4 py-3">Товар</th>
            <th className="px-4 py-3">Цена, сум</th>
            <th className="px-4 py-3">Остаток</th>
            <th className="px-4 py-3">В продаже</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {products.map((product) => (
            <tr key={product.id}>
              <td className="px-4 py-2">
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer" title="Сменить фото">
                    {product.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0].url}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sand-100 text-xs text-ink-muted">
                        фото
                      </span>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void photo(product, e.target.files?.[0])}
                    />
                  </label>
                  <div>
                    <div className="font-medium">{tr(product.name, 'ru')}</div>
                    <div className="text-xs text-ink-muted">
                      за {product.unit.toLowerCase()}
                      {arrivedToday(product) ? ' · сегодня привезли' : ''}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2">
                <input
                  className="field w-28 tabular-nums"
                  value={draft(product).price}
                  onChange={(e) =>
                    setDrafts({
                      ...drafts,
                      [product.id]: { ...draft(product), price: e.target.value },
                    })
                  }
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="field w-24 tabular-nums"
                  placeholder="∞"
                  value={draft(product).stock}
                  onChange={(e) =>
                    setDrafts({
                      ...drafts,
                      [product.id]: { ...draft(product), stock: e.target.value },
                    })
                  }
                />
              </td>
              <td className="px-4 py-2">
                <button
                  type="button"
                  className={`badge ${product.available ? 'badge-ok' : ''}`}
                  onClick={() => void toggle(product)}
                >
                  {product.available ? 'да' : 'нет'}
                </button>
              </td>
              <td className="px-4 py-2 text-right">
                <button type="button" className="btn-secondary" onClick={() => void save(product)}>
                  Сохранить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Arrivals({
  storeId,
  products,
  onChange,
  say,
}: {
  storeId: string;
  products: ProductDto[];
  onChange: () => void;
  say: (text: string) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (announce: boolean) => {
    setBusy(true);
    try {
      const r = await api().stores.markArrivals(storeId, {
        productIds: [...picked],
        announce,
        ...(photoUrl ? { photoUrl } : {}),
      });
      say(announce ? `Отмечено ${r.marked}, уведомлений: ${r.notified}` : `Отмечено ${r.marked}`);
      setPicked(new Set());
      onChange();
    } catch {
      say('Не получилось — проверьте права на точку');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p className="mt-3 text-sm text-ink-muted">
        Отметьте, что пришло утром. Значок «сегодня» держится сутки; рассылка уходит тем, кто
        заказывал здесь за последние 60 дней.
      </p>
      <div className="card mt-3 divide-y divide-line">
        {products.map((product) => (
          <label key={product.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <input
              type="checkbox"
              checked={picked.has(product.id)}
              onChange={(e) => {
                const next = new Set(picked);
                if (e.target.checked) next.add(product.id);
                else next.delete(product.id);
                setPicked(next);
              }}
            />
            <span className="flex-1">{tr(product.name, 'ru')}</span>
            {arrivedToday(product) ? <span className="badge">сегодня</span> : null}
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="Ссылка на фото прилавка (для push)"
          className="field min-w-[280px] flex-1"
        />
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || picked.size === 0}
          onClick={() => void submit(false)}
        >
          Отметить
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || picked.size === 0}
          onClick={() => void submit(true)}
        >
          Отметить и разослать
        </button>
      </div>
    </div>
  );
}

function Revenue({ storeId }: { storeId: string }) {
  const [report, setReport] = useState<SalesReportDto | null>(null);
  // The month's act for the accountant: delivered orders as CSV, downloaded straight from here.
  const download = async () => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { filename, csv } = await api().stores.report(storeId, { from });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };
  useEffect(() => {
    api()
      .analytics.sales({ storeId, granularity: 'day' })
      .then(setReport)
      .catch(() => setReport(null));
  }, [storeId]);
  if (!report) return <p className="mt-3 text-sm text-ink-muted">Считаем…</p>;
  const max = Math.max(1, ...report.series.map((point) => point.value));
  const delivered = report.byStatus.DELIVERED ?? 0;
  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Заказов за 30 дней', String(report.orders)],
          ['Доставлено', String(delivered)],
          ['Выручка', formatMoney(report.revenue.amount)],
          ['Скидки', formatMoney(report.discounts.amount)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs uppercase tracking-wider text-ink-muted">{label}</div>
            <div className="mt-1 font-display text-xl font-extrabold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <div className="card mt-3 p-4">
        <div className="text-xs uppercase tracking-wider text-ink-muted">По дням</div>
        <div className="mt-3 flex h-32 items-end gap-1">
          {report.series.map((point) => (
            <div
              key={point.at}
              className="flex-1 rounded-t bg-brand-500"
              style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }}
              title={`${new Date(point.at).toLocaleDateString('ru-RU')}: ${formatMoney(point.value)}`}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Кешбэк покупателям ({CASHBACK.PERCENT} %) и доставку платит платформа — выручка точки
        считается по товарам.
      </p>
      <button type="button" className="btn-secondary mt-3" onClick={() => void download()}>
        Отчёт за месяц (CSV)
      </button>
    </div>
  );
}

/** "Просят скидку": yes, no, or your own number — the customer hears at once. */
function Haggle({ storeId, say }: { storeId: string; say: (text: string) => void }) {
  const [rows, setRows] = useState<HaggleDto[]>([]);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const load = () =>
    api()
      .haggle.forStore(storeId)
      .then(setRows)
      .catch(() => setRows([]));
  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const answer = async (row: HaggleDto, accept: boolean) => {
    const own = counter[row.id]?.trim();
    try {
      await api().haggle.answer(row.id, {
        accept,
        ...(accept && own ? { price: Math.round(Number(own) * 100) } : {}),
      });
      say(accept ? 'Цена отправлена покупателю' : 'Отказ отправлен');
      load();
    } catch {
      say('Не получилось ответить');
    }
  };

  const pending = rows.filter((row) => row.status === 'PENDING');
  const done = rows.filter((row) => row.status !== 'PENDING');
  const soum = (minor: number) => formatMoney(minor);

  return (
    <div className="mt-3">
      <p className="text-sm text-ink-muted">
        Покупатель называет свою цену за единицу. «Согласен» — по его цене, впишите свою — будет
        встречная. Цена действует для него сутки.
      </p>
      <div className="card mt-3 divide-y divide-line">
        {pending.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ink-muted">Новых просьб нет.</p>
        ) : null}
        {pending.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-[200px] flex-1">
              <div className="font-medium">{tr(row.productName, 'ru')}</div>
              <div className="text-xs text-ink-muted">
                просят {soum(row.askedPrice.amount)} вместо {soum(row.listPrice.amount)}
                {row.message ? ` · «${row.message}»` : ''}
              </div>
            </div>
            <input
              className="field w-28 tabular-nums"
              placeholder="своя цена"
              value={counter[row.id] ?? ''}
              onChange={(e) => setCounter({ ...counter, [row.id]: e.target.value })}
            />
            <button type="button" className="btn-primary" onClick={() => void answer(row, true)}>
              Согласен
            </button>
            <button type="button" className="btn-secondary" onClick={() => void answer(row, false)}>
              Нет
            </button>
          </div>
        ))}
      </div>
      {done.length > 0 ? (
        <div className="card mt-3 divide-y divide-line">
          {done.slice(0, 20).map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="flex-1">{tr(row.productName, 'ru')}</span>
              <span className="text-xs text-ink-muted">
                {row.status === 'ACCEPTED' && row.offeredPrice
                  ? `договорились: ${soum(row.offeredPrice.amount)}`
                  : row.status === 'DECLINED'
                    ? 'отказано'
                    : 'истекло'}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
