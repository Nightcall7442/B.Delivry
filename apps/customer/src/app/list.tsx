/**
 * A shopping list in words — typed, dictated or photographed — becomes a
 * basket. Parsing runs on every keystroke, so the customer watches the list
 * turn into stall products and fixes the odd word before adding it all.
 */
import { Button, Chip, Field, Panel, Text, api, color, useLocale } from '@bazar/mobile';
import { canDictate, dictate, parseShoppingList, tr, unitLabel } from '@bazar/storefront';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Shell } from '@/components/ui/Shell';
import { useCartActions, useCartQuantities } from '@/features/cart/store';
import { listProducts } from '@/lib/catalog';
import { useData } from '@/lib/use-data';

export default function ListRoute() {
  const router = useRouter();
  const { locale, t } = useLocale();
  const products = useData(() => listProducts(), []) ?? [];
  const quantities = useCartQuantities();
  const { setQuantity } = useCartActions();
  const units = unitLabel(locale);

  const [text, setText] = useState('');
  // Line index → product id the customer picked among the alternatives.
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [listening, setListening] = useState(false);
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const session = useRef<{ stop(): void } | null>(null);
  useEffect(() => () => session.current?.stop(), []);

  const lines = useMemo(() => parseShoppingList(text, products), [text, products]);
  const resolved = lines.map((line, index) => {
    const picked = picks[index];
    const product = picked ? (products.find((p) => p.id === picked) ?? line.product) : line.product;
    return { ...line, product };
  });
  const matched = resolved.filter((line) => line.product !== null);

  const toggleDictation = () => {
    if (session.current) {
      session.current.stop();
      return;
    }
    const spoken = text;
    session.current = dictate(
      locale,
      (heard) => setText(spoken ? `${spoken}, ${heard}` : heard),
      () => {
        session.current = null;
        setListening(false);
      },
    );
    setListening(session.current !== null);
  };

  const pickPhoto = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    const asset = picked.assets?.[0];
    if (picked.canceled || !asset) return;
    setReading(true);
    setNote(null);
    try {
      const blob = await fetch(asset.uri).then((r) => r.blob());
      const { text: read } = await api().uploads.recognize(
        blob,
        asset.mimeType ?? blob.type ?? 'image/jpeg',
      );
      setText((current) => (current.trim() ? `${current.trim()}\n${read}` : read));
    } catch {
      setNote(t('common.error'));
    } finally {
      setReading(false);
    }
  };

  const addAll = () => {
    // Demand analytics: what the bazaar could not offer today is what to bring tomorrow.
    for (const line of resolved) {
      if (line.product === null) {
        void api()
          .analytics.recordDemand({ query: line.raw, results: 0, source: 'list' })
          .catch(() => undefined);
      }
    }
    for (const line of matched) {
      const product = line.product!;
      const step = product.quantityStep || 1;
      const wanted = Math.max(product.minQuantity, Math.round(line.quantity / step) * step);
      setQuantity(product.id, (quantities[product.id] ?? 0) + wanted);
    }
    setNote(t('list.added'));
    router.push('/cart');
  };

  return (
    <Shell back="history" expanded header={<Text role="display">{t('list.title')}</Text>}>
      <Text role="muted" style={{ marginTop: 4 }}>
        {t('list.intro')}
      </Text>
      <Field
        style={{ marginTop: 12, height: 96, alignItems: 'flex-start', paddingVertical: 12 }}
        value={text}
        onChangeText={setText}
        placeholder={t('list.placeholder')}
        multiline
        autoFocus
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {canDictate() ? (
          <Chip
            label={listening ? `■ ${t('list.stop')}` : `🎤 ${t('list.dictate')}`}
            active={listening}
            onPress={toggleDictation}
          />
        ) : null}
        <Chip
          label={reading ? t('list.recognizing') : `📷 ${t('list.photo')}`}
          onPress={() => void pickPhoto()}
        />
      </View>
      <Text role="caption" style={{ marginTop: 6 }}>
        {listening ? t('list.listening') : canDictate() ? t('list.ocrHint') : t('list.noMic')}
      </Text>
      {note ? (
        <Text role="caption" style={{ marginTop: 6, color: color.brand600 }}>
          {note}
        </Text>
      ) : null}

      {resolved.length > 0 ? (
        <View style={{ gap: 8, marginTop: 16 }}>
          {resolved.map((line, index) => (
            <Panel key={`${index}-${line.raw}`} style={{ padding: 12, gap: 4 }}>
              <Text role="caption">{line.raw}</Text>
              {line.product ? (
                <Text role="title">
                  {tr(line.product.name, locale)} · {line.quantity} {units[line.product.unit]} ·{' '}
                  {t.money(line.product.price.amount * line.quantity)}
                </Text>
              ) : (
                <Text role="muted" style={{ color: color.danger }}>
                  {t('list.notFound')}
                </Text>
              )}
              {line.alternatives.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {line.alternatives.map((alt) => (
                    <Pressable
                      key={alt.id}
                      onPress={() => setPicks((current) => ({ ...current, [index]: alt.id }))}
                      hitSlop={6}
                    >
                      <Text role="caption" style={{ color: color.brand600, fontWeight: '500' }}>
                        {tr(alt.name, locale)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Panel>
          ))}
          <Button
            label={t('list.addAll')}
            trailing={t.n('cart.items', matched.length)}
            disabled={matched.length === 0}
            style={{ marginTop: 4 }}
            onPress={addAll}
          />
        </View>
      ) : null}
    </Shell>
  );
}
