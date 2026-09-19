/**
 * The temperature on the kraft tag («Чорсу · утро · +18°») is real or absent —
 * never a number typed into the code. Open-Meteo needs no key and answers
 * from the browser; one reading is kept for ten minutes per app session.
 */
const CHORSU = { latitude: 41.3275, longitude: 69.2817 };
const TTL_MS = 10 * 60_000;

let cached: { at: number; value: number | null } | null = null;

export async function chorsuTemperature(fetcher: typeof fetch = fetch): Promise<number | null> {
  if (cached !== null && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CHORSU.latitude}&longitude=${CHORSU.longitude}&current=temperature_2m&timezone=Asia%2FTashkent`;
    const response = await fetcher(url);
    const body = (await response.json()) as { current?: { temperature_2m?: number } };
    const value = body.current?.temperature_2m;
    cached = { at: Date.now(), value: typeof value === 'number' ? Math.round(value) : null };
  } catch {
    cached = { at: Date.now(), value: null };
  }
  return cached.value;
}

/** «+18°» / «−3°» / «0°» — the sign the way a thermometer on a wall shows it. */
export const degrees = (value: number): string =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}°`;
