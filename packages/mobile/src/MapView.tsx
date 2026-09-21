/**
 * The map behind every screen: a WebView running Yandex Maps 3.0 when
 * EXPO_PUBLIC_YANDEX_MAPS_API_KEY is set, MapLibre over free OpenFreeMap tiles
 * otherwise; on the web the same page in an iframe. The kraft-paper canvas
 * with the same tile markers is the last resort — a page that fails to boot.
 */
import type { LatLngDto } from '@bazar/types';
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import { WebView } from 'react-native-webview';

import { Basket, Home, Scooter } from './Icons';
import { useT } from './locale';
import { Text } from './primitives';
import { color, shadow } from './theme';
import { mapHtml, type MapState } from './map-html';

export type MarkerKind = 'store' | 'home' | 'courier';

export interface MapMarker {
  id: string;
  point: LatLngDto;
  kind: MarkerKind;
  label?: string;
}

export interface MapViewProps {
  center: LatLngDto;
  zoom?: number;
  markers?: readonly MapMarker[];
  /** Fixed centre pin; the map reports where it stops (address picking). */
  pin?: boolean;
  onMoveEnd?: (center: LatLngDto) => void;
  /** Share of the screen under the sheet, so the visual centre sits above it. */
  inset?: number;
  interactive?: boolean;
}

const API_KEY = process.env['EXPO_PUBLIC_YANDEX_MAPS_API_KEY'] ?? '';

export function MapView({
  center,
  zoom = 14,
  markers = [],
  pin = false,
  onMoveEnd,
  inset = 0,
  interactive = true,
}: MapViewProps) {
  const { height } = useWindowDimensions();
  const [webFailed, setWebFailed] = useState(false);
  const common = { center, zoom, markers, onMoveEnd, interactive };

  return (
    <View
      style={[StyleSheet.absoluteFill, { bottom: Math.max(0, Math.round(height * inset) - 24) }]}
    >
      {webFailed ? (
        <FallbackMap {...common} />
      ) : (
        <WebMap {...common} onFail={() => setWebFailed(true)} />
      )}
      {pin ? (
        <View style={[s.centrePin, anchor('home', true)]}>
          <Tile kind="home" big />
        </View>
      ) : null}
    </View>
  );
}

type RendererProps = Required<Pick<MapViewProps, 'center' | 'zoom' | 'markers' | 'interactive'>> & {
  onMoveEnd: MapViewProps['onMoveEnd'] | undefined;
};

type PageMessage = { type: string; lat?: number; lng?: number };

function WebMap({
  center,
  zoom,
  markers,
  onMoveEnd,
  interactive,
  onFail,
}: RendererProps & { onFail: () => void }) {
  const ref = useRef<WebView>(null);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const ready = useRef(false);
  const html = useMemo(() => mapHtml(API_KEY), []);

  const state: MapState = useMemo(
    () => ({
      center,
      zoom,
      interactive,
      markers: markers.map((m) => ({
        id: m.id,
        lat: m.point.lat,
        lng: m.point.lng,
        kind: m.kind,
        ...(m.label ? { label: m.label } : {}),
      })),
    }),
    [center, zoom, interactive, markers],
  );

  const push = useCallback(() => {
    if (Platform.OS === 'web') {
      frame.current?.contentWindow?.postMessage(JSON.stringify({ type: 'update', state }), '*');
      return;
    }
    ref.current?.injectJavaScript(
      `window.__map && window.__map.update(${JSON.stringify(state)}); true;`,
    );
  }, [state]);

  useEffect(() => {
    if (ready.current) push();
  }, [push]);

  // What the page says back; kept in a ref so the web listener below never goes stale.
  const onPage = useRef((_data: string) => {});
  onPage.current = (data: string) => {
    try {
      const msg = JSON.parse(data) as PageMessage;
      if (msg.type === 'ready') {
        ready.current = true;
        push();
      } else if (msg.type === 'moveEnd' && msg.lat !== undefined && msg.lng !== undefined) {
        onMoveEnd?.({ lat: msg.lat, lng: msg.lng });
      } else if (msg.type === 'error') {
        onFail();
      }
    } catch {
      // Not ours.
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listen = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && typeof event.data === 'string')
        onPage.current(event.data);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  if (Platform.OS === 'web') {
    // react-native-web has no WebView: the same page in a sandboxed iframe.
    return createElement('iframe', {
      ref: frame,
      srcDoc: html,
      sandbox: 'allow-scripts',
      title: 'map',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 },
    });
  }

  return (
    <WebView
      ref={ref}
      source={{ html, baseUrl: 'https://bazar.local/' }}
      style={{ flex: 1, backgroundColor: color.sand100 }}
      originWhitelist={['*']}
      javaScriptEnabled
      scrollEnabled={false}
      onMessage={(event) => onPage.current(event.nativeEvent.data)}
      onError={onFail}
    />
  );
}

/** Equirectangular projection around the centre; draggable so the pin can be placed. */
function FallbackMap({ center, zoom, markers, onMoveEnd, interactive }: RendererProps) {
  const t = useT();
  const { width, height } = useWindowDimensions();
  const [view, setView] = useState(center);
  const viewRef = useRef(center);
  const start = useRef(center);

  useEffect(() => {
    setView(center);
    viewRef.current = center;
  }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Projection maths from the *current* view; the handlers read state through
  // refs so a drag never rebuilds the responder mid-gesture.
  const scaleFor = (lat: number) => {
    const cosLat = Math.cos((lat * Math.PI) / 180);
    return { cosLat, metersPerPx: (156543.03 * cosLat) / 2 ** zoom };
  };
  const { cosLat, metersPerPx } = scaleFor(view.lat);
  const project = (p: LatLngDto) => ({
    x: ((p.lng - view.lng) * 111_320 * cosLat) / metersPerPx,
    y: -((p.lat - view.lat) * 110_540) / metersPerPx,
  });

  const moveEnd = useRef(onMoveEnd);
  moveEnd.current = onMoveEnd;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => interactive,
        onMoveShouldSetPanResponder: () => interactive,
        onPanResponderGrant: () => {
          start.current = viewRef.current;
        },
        onPanResponderMove: (_, g) => {
          const scale = scaleFor(start.current.lat);
          const next = {
            lat: start.current.lat + (g.dy * scale.metersPerPx) / 110_540,
            lng: start.current.lng - (g.dx * scale.metersPerPx) / (111_320 * scale.cosLat),
          };
          viewRef.current = next;
          setView(next);
        },
        onPanResponderRelease: () => moveEnd.current?.(viewRef.current),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interactive, zoom],
  );

  return (
    <View
      {...pan.panHandlers}
      style={{ flex: 1, backgroundColor: color.sand100, overflow: 'hidden' }}
    >
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="dots" width={28} height={28} patternUnits="userSpaceOnUse">
            <Circle cx={14} cy={14} r={1} fill="rgba(27,31,34,0.14)" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" />
      </Svg>
      {markers.map((m) => {
        const { x, y } = project(m.point);
        return (
          <View
            key={m.id}
            style={[
              s.marker,
              anchor(m.kind),
              { transform: [{ translateX: Math.round(x) }, { translateY: Math.round(y) }] },
            ]}
          >
            <Tile kind={m.kind} label={m.label} />
          </View>
        );
      })}
      {Platform.OS === 'web' && __DEV__ ? (
        <View style={s.note}>
          <Text role="caption">{t('map.webview')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A majolica tile: rotated square, glyph set straight. The tile sits in a box
 * the size of its diagonal, so the box's bottom edge is the diamond's lower
 * corner — the point on the map. Labels float above without widening the box.
 */
const LABEL_W = 150;
const tileBox = (big: boolean) => (big ? 62 : 52);

function Tile({
  kind,
  label,
  big = false,
}: {
  kind: MarkerKind;
  label?: string | undefined;
  big?: boolean;
}) {
  if (kind === 'courier') {
    return (
      <View style={s.courier}>
        <Scooter size={24} color={color.brand600} strokeWidth={2.2} />
      </View>
    );
  }
  const d = tileBox(big);
  const size = big ? 44 : 36;
  const Glyph = kind === 'store' ? Basket : Home;
  const bg = kind === 'home' ? color.saffron500 : color.brand500;
  const fg = kind === 'home' ? color.ink : color.white;
  return (
    <View style={{ width: d, height: d, alignItems: 'center', justifyContent: 'center' }}>
      {label ? (
        <View style={[s.labelSlot, { left: (d - LABEL_W) / 2, bottom: d + 4 }]}>
          <View style={s.label}>
            <Text
              role="caption"
              numberOfLines={1}
              style={{ color: color.ink, fontWeight: '700', fontSize: 11 }}
            >
              {label}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={[s.tile, { width: size, height: size, backgroundColor: bg }]}>
        <View style={{ transform: [{ rotate: '-45deg' }] }}>
          <Glyph size={big ? 24 : 20} color={fg} strokeWidth={2.2} />
        </View>
      </View>
    </View>
  );
}

/** Where to put a marker box so its anchor lands on the projected point. */
const anchor = (kind: MarkerKind, big = false) => {
  const w = kind === 'courier' ? 44 : tileBox(big);
  return { marginLeft: -w / 2, marginTop: -w };
};

const s = StyleSheet.create({
  centrePin: { position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' },
  marker: { position: 'absolute', left: '50%', top: '50%' },
  tile: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    ...shadow.pop,
  },
  courier: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(158,42,43,0.3)',
    ...shadow.pop,
  },
  labelSlot: { position: 'absolute', width: LABEL_W, alignItems: 'center' },
  label: {
    maxWidth: LABEL_W,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    ...shadow.card,
  },
  note: {
    position: 'absolute',
    left: 12,
    top: 64,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
