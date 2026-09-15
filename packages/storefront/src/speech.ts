/**
 * Dictation through the browser's speech API (Chrome, Safari, Android
 * WebView). Returns null where it is missing — there the keyboard's own mic
 * still types into the field, so the screen only hides its button.
 */
interface Recognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

const SPEECH_LANG: Record<string, string> = { ru: 'ru-RU', uz: 'uz-UZ', en: 'en-US' };

export const canDictate = (): boolean => recognizerCtor() !== null;

function recognizerCtor(): (new () => Recognizer) | null {
  const g = globalThis as {
    SpeechRecognition?: new () => Recognizer;
    webkitSpeechRecognition?: new () => Recognizer;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

/** Starts listening; `onText` gets the whole transcript so far, `onEnd` fires once. */
export function dictate(
  locale: string,
  onText: (text: string) => void,
  onEnd: () => void,
): { stop(): void } | null {
  const Ctor = recognizerCtor();
  if (Ctor === null) return null;
  const rec = new Ctor();
  rec.lang = SPEECH_LANG[locale] ?? SPEECH_LANG['ru']!;
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = (event) =>
    onText(
      Array.from(event.results, (r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim(),
    );
  rec.onend = onEnd;
  rec.onerror = () => rec.stop();
  rec.start();
  return { stop: () => rec.stop() };
}
