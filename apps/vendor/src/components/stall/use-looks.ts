/**
 * «Покажите товар»: the customers' asks for a live photo of a good — read when the stall tab is in
 * front and every few seconds while it stays there (a new ask also arrives as a push), answered
 * with a photograph taken at the counter.
 */
import { api } from '@bazar/mobile';
import { stallErrorText } from '@bazar/storefront';
import type { ProductLookDto } from '@bazar/types';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const POLL_SECONDS = 15;

export function useLooks(storeId: string | null) {
  const [rows, setRows] = useState<ProductLookDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(
    async (quiet = false) => {
      if (!storeId) return;
      const mine = ++latest.current;
      if (!quiet) setFailed(false);
      try {
        const fresh = await api().looks.forStore(storeId);
        if (mine === latest.current) {
          setRows(fresh);
          setFailed(false);
        }
      } catch {
        if (mine === latest.current) setFailed(true);
      }
    },
    [storeId],
  );

  useEffect(() => {
    latest.current++;
    setRows(null);
    setFailed(false);
    setNotice(null);
  }, [storeId]);

  useFocusEffect(
    useCallback(() => {
      if (!storeId) return;
      void reload();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') void reload(true);
      }, POLL_SECONDS * 1000);
      return () => clearInterval(timer);
    }, [storeId, reload]),
  );

  /** Uploads the photo and answers the ask; false says why in `notice` and refreshes the list. */
  const answer = useCallback(
    async (row: ProductLookDto, photo: Blob, type: string): Promise<boolean> => {
      setAnswering(row.id);
      setNotice(null);
      try {
        const uploaded = await api().uploads.image('product-images', photo, type);
        const updated = await api().looks.answer(row.id, { photoUrl: uploaded.url });
        setRows((current) =>
          current ? current.map((each) => (each.id === updated.id ? updated : each)) : current,
        );
        return true;
      } catch (error) {
        setNotice(stallErrorText(error, 'Фото не ушло — попробуйте ещё раз'));
        // Most often a second phone at the stall answered first: show what is true now.
        void reload();
        return false;
      } finally {
        setAnswering(null);
      }
    },
    [reload],
  );

  return { rows, failed, answering, notice, reload, answer };
}
