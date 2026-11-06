import { useMemo, useState } from 'preact/hooks';

/** Interaktiver Pick&Mix-Konfigurator (Island, `client:visible`). Alle Texte kommen über Props, keine Abhängigkeit vom Build-Datenstand. */
export interface PickAndMixProps {
  intl: string;
  strings: {
    step1: string;
    step2: string;
    add: string;
    remove: string;
    full: string;
    of: string;
    left: string;
    piece: string;
    pieces: string;
    toCart: string;
    choose: string;
    perPiece: string;
    sizeLabel: string;
  };
  eyebrow: string;
  title: string;
  sizes: number[];
  defaultSize: number;
  flavors: { key: string; name: string; priceCents: number; color: string }[];
  initial: Record<string, number>;
  labelId: string;
}

export default function PickAndMix(p: PickAndMixProps) {
  const [size, setSize] = useState(p.defaultSize);
  const [q, setQ] = useState<Record<string, number>>(() => {
    // Startzustand nie über die Boxgröße hinaus
    const out: Record<string, number> = {};
    let used = 0;
    for (const f of p.flavors) {
      const want = Math.min(p.initial[f.key] ?? 0, p.defaultSize - used);
      out[f.key] = Math.max(0, want);
      used += out[f.key]!;
    }
    return out;
  });
  const money = useMemo(() => {
    const nf = new Intl.NumberFormat(p.intl, { style: 'currency', currency: 'EUR' });
    return (cents: number) => nf.format(cents / 100);
  }, [p.intl]);

  const count = p.flavors.reduce((s, f) => s + (q[f.key] ?? 0), 0);
  const full = count >= size;
  const left = size - count;
  const total = p.flavors.reduce((s, f) => s + (q[f.key] ?? 0) * f.priceCents, 0);
  const slots: string[] = p.flavors.flatMap((f) =>
    Array.from({ length: q[f.key] ?? 0 }, () => f.color),
  );

  function pickSize(n: number) {
    // Verkleinern entfernt überzählige Stücke von hinten
    const next = { ...q };
    let c = count;
    for (const f of [...p.flavors].reverse())
      while (c > n && (next[f.key] ?? 0) > 0) {
        next[f.key] = (next[f.key] ?? 0) - 1;
        c--;
      }
    setSize(n);
    setQ(next);
  }
  const set = (key: string, v: number) => setQ({ ...q, [key]: v });
  const s = p.strings;

  return (
    <div class="panel demo reveal" style="border-radius:28px">
      <div>
        <p class="mono m" style="margin:0 0 10px">
          {p.eyebrow}
        </p>
        <p class="display" style="margin:0 0 28px;font-size:32px;font-weight:700">
          {p.title}
        </p>
        <p class="mono m" id={`${p.labelId}-size`} style="margin:0 0 12px">
          {s.step1}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${p.labelId}-size`}
          style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:32px"
        >
          {p.sizes.map((n) => (
            <button
              type="button"
              role="radio"
              aria-checked={n === size ? 'true' : 'false'}
              class="size"
              onClick={() => pickSize(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p class="mono m" style="margin:0 0 4px">
          {s.step2}
        </p>
        {p.flavors.map((f) => (
          <div class="item">
            <span style={`width:14px;height:14px;border-radius:99px;background:${f.color}`} />
            <span>
              <span style="display:block;font-size:17px">{f.name}</span>
              <span class="mono m">
                {money(f.priceCents)}
                {s.perPiece}
              </span>
            </span>
            <span style="display:inline-flex;align-items:center;gap:12px">
              <button
                type="button"
                class="step"
                aria-label={f.name + s.remove}
                disabled={(q[f.key] ?? 0) === 0}
                onClick={() => set(f.key, Math.max(0, (q[f.key] ?? 0) - 1))}
              >
                −
              </button>
              <span
                style="min-width:22px;text-align:center;font-variant-numeric:tabular-nums;font-size:17px"
                aria-live="polite"
              >
                {q[f.key] ?? 0}
              </span>
              <button
                type="button"
                class="step"
                aria-label={f.name + s.add}
                disabled={full}
                onClick={() => !full && set(f.key, (q[f.key] ?? 0) + 1)}
              >
                +
              </button>
            </span>
          </div>
        ))}
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div style="border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:24px;flex:1">
          <div
            style={`display:grid;grid-template-columns:repeat(${size > 24 ? 8 : 6},minmax(0,1fr));gap:8px`}
          >
            {Array.from({ length: size }, (_, i) => (
              <span
                class={`slot ${i < slots.length ? 'full pop' : ''}`}
                style={`background:${i < slots.length ? slots[i] : 'transparent'}`}
              />
            ))}
          </div>
        </div>
        <div>
          <div style="height:4px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden">
            <div
              class="liquid-bg"
              style={`height:100%;width:${Math.round((count / size) * 100)}%;transition:width .5s cubic-bezier(.16,1,.3,1)`}
            />
          </div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:16px;gap:16px">
            <span aria-live="polite" style="font-size:17px">
              {full
                ? s.full
                : `${count}${s.of}${size}${s.left}${left}${left === 1 ? s.piece : s.pieces}`}
            </span>
            <span
              class="display"
              style="font-size:32px;font-weight:700;font-variant-numeric:tabular-nums"
            >
              {money(total)}
            </span>
          </div>
          <button
            type="button"
            class="cartbtn"
            disabled={!full}
            style={`background:${full ? '#f3f2ef' : 'rgba(255,255,255,.08)'};color:${full ? '#0c0c0d' : '#9b9b98'}`}
          >
            {full ? s.toCart : s.choose.replace('{n}', String(left))}
          </button>
        </div>
      </div>
    </div>
  );
}
