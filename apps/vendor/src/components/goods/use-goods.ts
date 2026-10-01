/**
 * The stall's shelf on the phone: every good of the stall, sold-out ones included, the «В наличии»
 * switch that answers at once and takes itself back if the API refuses, and the price/stock edit.
 */
import { isApiError } from '@bazar/api-client';
import { api } from '@bazar/mobile';
import {
  sortStallProducts,
  stallErrorText,
  toStallProducts,
  type StallProduct,
} from '@bazar/storefront';
import type { UpdateProductDto } from '@bazar/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The API's page ceiling. */
const PAGE_SIZE = 100;
/** Ten pages are a thousand goods: a stall never has that many, a shop may — and the screen says so. */
const MAX_PAGES = 10;

interface Shelf {
  items: StallProduct[];
  /** The stall has more goods than were loaded. */
  truncated: boolean;
}

/**
 * `GET /catalog` is the customers' list: it hides what is switched off (and reads `availableOnly=false`
 * as true), so a good the seller turned off could never be turned on again from it. `GET /products` is
 * the seller's own list, every good, answering database rows — `toStallProducts` reads them.
 */
async function loadShelf(storeId: string): Promise<Shelf> {
  const list = (page: number) =>
    api().http.paginated<unknown>('/products', { storeId, page, pageSize: PAGE_SIZE });
  const first = await list(1);
  const { totalPages } = first.pagination;
  const rest = await Promise.all(
    Array.from({ length: Math.min(totalPages, MAX_PAGES) - 1 }, (_, i) => list(i + 2)),
  );
  return {
    items: sortStallProducts(toStallProducts([first, ...rest].flatMap((page) => page.items))),
    truncated: totalPages > MAX_PAGES,
  };
}

/**
 * The API answers this write with 204 and no body, which the client cannot tell from a broken
 * response and throws as `MALFORMED_RESPONSE (204)`. The write itself went through.
 */
async function putAvailability(id: string, available: boolean): Promise<void> {
  try {
    await api().catalog.setAvailability(id, available);
  } catch (error) {
    if (isApiError(error) && error.status === 204) return;
    throw error;
  }
}

export function useGoods(storeId: string | null) {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Goods whose switch is waiting for the API: one answer at a time per good.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  // The answer to the latest request wins: a slow first try must not overwrite a fresh pull.
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!storeId) return;
    const mine = ++latest.current;
    setFailed(false);
    try {
      const loaded = await loadShelf(storeId);
      if (mine === latest.current) setShelf(loaded);
    } catch {
      // A failed refresh keeps the shelf on screen; the screen decides what a failure means.
      if (mine === latest.current) setFailed(true);
    }
  }, [storeId]);

  useEffect(() => {
    latest.current++;
    setShelf(null);
    setFailed(false);
    setNotice(null);
    setPending(new Set());
    void reload();
  }, [reload]);

  // The order is the one the shelf was loaded in: a good that is switched off stays under the
  // thumb until the next refresh instead of jumping away from the row the seller is tapping.
  const patch = useCallback((id: string, change: Partial<StallProduct>) => {
    setShelf(
      (current) =>
        current && {
          ...current,
          items: current.items.map((item) => (item.id === id ? { ...item, ...change } : item)),
        },
    );
  }, []);

  const setAvailable = useCallback(
    async (id: string, available: boolean) => {
      setNotice(null);
      setPending((current) => new Set(current).add(id));
      patch(id, { available });
      try {
        await putAvailability(id, available);
      } catch (error) {
        patch(id, { available: !available });
        setNotice(stallErrorText(error, 'Не получилось — товар остался как был'));
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [patch],
  );

  /** Throws when the API refuses, so the sheet can say so; the shelf changes only on success. */
  const save = useCallback(
    async (id: string, update: Pick<UpdateProductDto, 'price' | 'stock'>) => {
      // The answer is a database row, not a ProductDto: the shelf takes what was sent.
      await api().catalog.updateProduct(id, update);
      patch(id, {
        ...(update.price ? { price: update.price } : {}),
        ...(update.stock !== undefined ? { stock: update.stock } : {}),
      });
    },
    [patch],
  );

  return {
    items: shelf?.items ?? null,
    truncated: shelf?.truncated ?? false,
    failed,
    notice,
    pending,
    reload,
    setAvailable,
    save,
  };
}
