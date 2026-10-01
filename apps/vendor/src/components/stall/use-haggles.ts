/**
 * The asks of customers who want a lower price: read when the stall tab is in front and every few
 * seconds while it stays there (a new ask also arrives as a push, but the list must not depend on
 * one), answered with yes, no or the seller's own number.
 */
import { api } from '@bazar/mobile';
import { stallErrorText } from '@bazar/storefront';
import type { AnswerHaggleDto, HaggleDto } from '@bazar/types';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const POLL_SECONDS = 15;

export function useHaggles(storeId: string | null) {
  const [rows, setRows] = useState<HaggleDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The answer to the latest request wins: a slow first try must not overwrite a fresh pull.
  const latest = useRef(0);

  // `quiet`: the poll. A failed poll says so, but a good one does not flash the error in between.
  const reload = useCallback(
    async (quiet = false) => {
      if (!storeId) return;
      const mine = ++latest.current;
      if (!quiet) setFailed(false);
      try {
        const fresh = await api().haggle.forStore(storeId);
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

  /** True when the customer has been answered; false says why in `notice` and refreshes the list. */
  const answer = useCallback(
    async (row: HaggleDto, body: AnswerHaggleDto): Promise<boolean> => {
      setAnswering(row.id);
      setNotice(null);
      try {
        const updated = await api().haggle.answer(row.id, body);
        setRows((current) =>
          current ? current.map((each) => (each.id === updated.id ? updated : each)) : current,
        );
        return true;
      } catch (error) {
        setNotice(stallErrorText(error, 'Не получилось ответить — попробуйте ещё раз'));
        // Most often somebody else answered first, or the ask ran out: show what is true now.
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
