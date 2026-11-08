/**
 * Findet in Block-Inhalten alle Texte, die übersetzt werden müssen, und setzt die Übersetzungen wieder ein.
 * Nur bekannte Textfelder werden angefasst; IDs, Typen, Links, Farben, Zahlen und Medienverweise bleiben unverändert.
 */

/** Felder mit Fließtext/Beschriftungen (Klartext-Strings). */
const TEXT_KEYS = new Set([
  'title',
  'eyebrow',
  'intro',
  'label',
  'caption',
  'text',
  'badge',
  'navLabel',
  'name',
  'line1',
  'line2',
  'seoTitle',
  'seoDescription',
]);

interface Run {
  text: string;
  [key: string]: unknown;
}

export interface TextSlot {
  /** Text, wie er an das Modell geht (Inline mit mehreren Läufen: `<r1>…</r1><r2>…</r2>`). */
  text: string;
  /** Setzt die Übersetzung ein. `false`, wenn die Lauf-Markierungen nicht zurückkamen. */
  apply(translated: string): boolean;
  /** Läufe einzeln, falls `apply` scheiterte. */
  runs(): string[];
  applyRuns(translated: string[]): void;
}

const hasLetters = (s: string) => /\p{L}/u.test(s);
const isRun = (v: unknown): v is Run =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Run).text === 'string' &&
  !('kind' in v) &&
  !('type' in v);
const isInline = (v: unknown): v is Run[] => Array.isArray(v) && v.length > 0 && v.every(isRun);

const TAG = /<r(\d+)>([\s\S]*?)<\/r\1>/g;

function inlineSlot(runs: Run[]): TextSlot {
  const encode = () =>
    runs.length === 1
      ? runs[0]!.text
      : runs.map((r, i) => `<r${i + 1}>${r.text}</r${i + 1}>`).join('');
  const original = encode();
  return {
    text: original,
    apply(translated) {
      if (runs.length === 1) {
        runs[0]!.text = translated.replace(/<\/?r\d+>/g, '');
        return true;
      }
      const found = new Map<number, string>();
      for (const m of translated.matchAll(TAG)) found.set(Number(m[1]), m[2]!);
      if (found.size !== runs.length || runs.some((_, i) => !found.has(i + 1))) return false;
      runs.forEach((r, i) => (r.text = found.get(i + 1)!));
      return true;
    },
    runs: () => runs.map((r) => r.text),
    applyRuns(translated) {
      runs.forEach((r, i) => (r.text = translated[i] ?? r.text));
    },
  };
}

function plainSlot(holder: Record<string, unknown>, key: string): TextSlot {
  const value = holder[key] as string;
  const lead = /^\s*/.exec(value)![0];
  const trail = /\s*$/.exec(value)![0];
  const set = (t: string) => (holder[key] = lead + t.trim() + trail);
  return {
    text: value.trim(),
    apply(translated) {
      set(translated);
      return true;
    },
    runs: () => [value.trim()],
    applyRuns: (t) => set(t[0] ?? value),
  };
}

/** Sammelt die Textfelder in einer tiefen Kopie von `tree`; die Slots schreiben in diese Kopie (`result`). */
export function extractTexts<T>(tree: T): { result: T; slots: TextSlot[] } {
  const result = structuredClone(tree);
  const slots: TextSlot[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      if (isInline(v)) {
        if (v.some((r) => hasLetters(r.text))) slots.push(inlineSlot(v));
        return;
      }
      v.forEach(visit);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    const o = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(o)) {
      if (typeof val === 'string') {
        if (TEXT_KEYS.has(k) && hasLetters(val)) slots.push(plainSlot(o, k));
      } else visit(val);
    }
  };
  visit(result);
  return { result, slots };
}
