/** Minimales Client-Script (kein Framework): Theme, Sprache, Seitenübergang, Menü, Anfrage-Modal, Projektfilter, Kapitel-Navigation, Bildstrecken ziehen. */
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element>(sel: string, ctx: ParentNode = document) => ctx.querySelector<T>(sel);
const $$ = <T extends Element>(sel: string, ctx: ParentNode = document) => [
  ...ctx.querySelectorAll<T>(sel),
];

// ── Theme ────────────────────────────────────────────────────────────
const themeBtn = $<HTMLButtonElement>('[data-theme-toggle]');
function paintTheme() {
  if (!themeBtn) return;
  const light = root.classList.contains('light');
  const label = (light ? themeBtn.dataset.labelOff : themeBtn.dataset.labelOn) ?? '';
  themeBtn.setAttribute('aria-label', label);
  themeBtn.title = label;
}
paintTheme();
themeBtn?.addEventListener('click', () => {
  const light = root.classList.toggle('light');
  try {
    localStorage.setItem('theme', light ? 'light' : 'dark');
  } catch {
    /* privater Modus */
  }
  paintTheme();
});

// ── Seitenübergang (Vorhang schließt beim Verlassen) ─────────────────
const curtain = $('.curtain');
function leave(href: string) {
  if (reduced || !curtain) {
    location.href = href;
    return;
  }
  curtain.classList.add('leaving');
  setTimeout(() => {
    location.href = href;
  }, 900);
}
// Welle: Klick auf eine Projektkachel → die Nachbarn räumen das Feld (nächste zuerst), danach wächst das Bild der
// Kachel zum ersten Bild der Projektseite (Morph, siehe unten).
const canWave = !reduced;
let waving: Animation[] = [];
let leaving = false;
function wave(from: HTMLElement): Promise<void> {
  const scope: ParentNode = from.closest('.bento, .pgrid') ?? document;
  const o = from.getBoundingClientRect();
  const ox = o.left + o.width / 2;
  const oy = o.top + o.height / 2;
  // Hero-Karte: Überschrift, Text und sichtbare Kacheln räumen das Feld
  const hero = from.matches('.hp') ? from.closest('section') : null;
  const neighbours = hero
    ? [
        ...$$<HTMLElement>('.eyebrow, .hero-h1, .hero-grid > :first-child', hero),
        ...$$<HTMLElement>('.tile'),
      ]
    : from.closest('.names')
      ? [...$$<HTMLElement>('.names a', from.closest('.names')!), ...$$<HTMLElement>('.svc, .tile')]
      : $$<HTMLElement>('.tile, .g', scope);
  const peers = neighbours
    .filter((el) => el !== from && !from.contains(el))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return { el, r, d: Math.hypot(r.left + r.width / 2 - ox, r.top + r.height / 2 - oy) };
    })
    .filter(({ r }) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth);
  const max = Math.max(1, ...peers.map((p) => p.d));
  waving = peers.map(({ el, d }) =>
    el.animate(
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(.6)' },
      ],
      {
        duration: 380,
        delay: (d / max) * 300,
        easing: 'cubic-bezier(.65,0,.35,1)',
        fill: 'forwards',
      },
    ),
  );
  return Promise.all(waving.map((a) => a.finished.catch(() => undefined))).then(() => undefined);
}
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  curtain?.classList.remove('leaving');
  document.dispatchEvent(new Event('serend:resume'));
  for (const a of waving) a.cancel();
  waving = [];
  leaving = false;
  // Zurück aus dem Zwischenspeicher: das Bild der Projektseite fliegt in seine Kachel
  (window as unknown as { __startMorph?: () => void }).__startMorph?.();
  runMorph();
});
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  const samePage = url.pathname === location.pathname && url.search === location.search;
  if (samePage && url.hash) return; // Anker auf derselben Seite
  if (/\.(md|png|txt|xml)$/.test(url.pathname)) return;
  e.preventDefault();
  document.dispatchEvent(new Event('serend:leave'));
  // Kachel, Hero-Karte oder Name (nur mit Hover: dessen Vorschaubild ist die Quelle) morphen, sofern die
  // Projektseite ein erstes Bild hat (data-vt-srcset); sonst bleibt es beim Vorhang
  const morphs =
    (a.matches('.tile, .g, .hp') ||
      (a.matches('.names a') && matchMedia('(hover: hover)').matches)) &&
    a.hasAttribute('data-vt-srcset') &&
    forwardRecord(a, url) !== null;
  if (leaving) return;
  if (canWave && !samePage && morphs) {
    leaving = true;
    void wave(a).then(() => {
      const rec = forwardRecord(a, url);
      if (rec) {
        stash(rec);
        try {
          sessionStorage.setItem(
            FROM_KEY,
            JSON.stringify({ proj: url.pathname, home: location.pathname, kind: rec.kind }),
          );
        } catch {
          /* privater Modus */
        }
      }
      location.href = url.href;
    });
    return;
  }
  leave(url.href);
});

// ── Morph: das Bild der angeklickten Kachel wächst zum ersten Bild der Projektseite, und beim Zurückgehen wieder in die Kachel ──
const MORPH_KEY = 'serend:morph';
const FROM_KEY = 'serend:from';
interface MorphRecord {
  /** fwd: Kachel → Projektseite, back: Projektseite → Kachel */
  k: 'fwd' | 'back';
  /** Art der Quelle: tile, g, hp oder nm (Namenszeile) */
  kind: string;
  /** Pfad des Projekts */
  proj: string;
  /** Pfad der Seite, auf der der Morph läuft */
  p: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rad: number;
  bg: string;
  rot: number;
  t: number;
}
const kindOf = (el: Element) =>
  el.closest('.names') ? 'nm' : el.matches('.hp') ? 'hp' : el.matches('.g') ? 'g' : 'tile';
/** Der sichtbare Rahmen des Bildes: Kachel, Hero-Karte, Rasterbild oder Vorschau der Namenszeile. */
const frameOf = (a: HTMLElement): HTMLElement | null =>
  a.closest('.names') ? $('.pk', a) : a.matches('.g') ? $('.ph', a) : a;
/** Position und Größe ohne Drehung (die Vorschau der Namenszeile ist um 3° gedreht). */
function measure(frame: HTMLElement) {
  const bb = frame.getBoundingClientRect();
  const w = frame.offsetWidth;
  const h = frame.offsetHeight;
  return { x: bb.left + bb.width / 2 - w / 2, y: bb.top + bb.height / 2 - h / 2, w, h };
}
function stash(rec: MorphRecord): void {
  try {
    sessionStorage.setItem(MORPH_KEY, JSON.stringify(rec));
  } catch {
    /* privater Modus: dann gibt es keinen Morph */
  }
}
function forwardRecord(a: HTMLElement, url: URL): MorphRecord | null {
  const frame = frameOf(a);
  const img = frame && $<HTMLImageElement>('img', frame);
  const src = img?.currentSrc || img?.src;
  if (!frame || !src) return null;
  const cs = getComputedStyle(frame);
  const kind = kindOf(a);
  return {
    k: 'fwd',
    kind,
    proj: url.pathname,
    p: url.pathname,
    src,
    ...measure(frame),
    rad: parseFloat(cs.borderTopLeftRadius) || 0,
    bg: cs.backgroundColor,
    rot: kind === 'nm' ? 3 : 0,
    t: Date.now(),
  };
}
// Zurück per Browser-Button: das erste Bild der Projektseite merkt sich Position und Bild für die Startseite
interface NavigationLike {
  addEventListener(
    type: 'navigate',
    fn: (e: { navigationType: string; destination?: { url: string } }) => void,
  ): void;
}
const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
nav?.addEventListener('navigate', (e) => {
  if (reduced || e.navigationType !== 'traverse' || !e.destination) return;
  let from: { proj: string; home: string; kind: string } | null;
  try {
    from = JSON.parse(sessionStorage.getItem(FROM_KEY) ?? 'null');
  } catch {
    from = null;
  }
  if (!from || from.proj !== location.pathname) return;
  if (new URL(e.destination.url).pathname !== from.home) return;
  const fig = $<HTMLElement>('.strip figure');
  const img = fig && $<HTMLImageElement>('img', fig);
  const src = img?.currentSrc || img?.src;
  if (!fig || !src) return;
  const bb = fig.getBoundingClientRect();
  if (bb.bottom < 0 || bb.top > innerHeight) return; // nicht im Bild: kein Morph
  stash({
    k: 'back',
    kind: from.kind,
    proj: from.proj,
    p: from.home,
    src,
    x: bb.left,
    y: bb.top,
    w: bb.width,
    h: bb.height,
    rad: parseFloat(getComputedStyle(fig).borderTopLeftRadius) || 0,
    bg: getComputedStyle(fig).backgroundColor,
    rot: 0,
    t: Date.now(),
  });
});
/** Läuft auf der Zielseite: die Überlagerung aus dem Head-Script fliegt von der Quelle zum (live gemessenen) Ziel. */
function runMorph(): void {
  const w = window as unknown as { __morph?: { m: MorphRecord; o: HTMLElement } };
  const st = w.__morph;
  if (!st) return;
  w.__morph = undefined;
  const { m, o } = st;
  let link: HTMLElement | null = null;
  let frame: HTMLElement | null;
  if (m.k === 'fwd') frame = $('.strip figure');
  else {
    const links = $$<HTMLAnchorElement>('.tile[href], .g[href], .hp[href], .names a[href]').filter(
      (a) => new URL(a.href).pathname === m.proj,
    );
    link = links.find((a) => kindOf(a) === m.kind) ?? links[0] ?? null;
    frame = link && frameOf(link);
  }
  if (!frame) {
    root.classList.remove('morph-pending');
    o.remove();
    return;
  }
  const target = frame;
  link?.classList.add('on'); // die Vorschau der Namenszeile steht nur beim Hover, hier bis zum Ende
  target.classList.add('morph-hide');
  root.classList.remove('morph-pending');
  const radTo = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
  const rotTo = target.matches('.pk') ? 3 : 0;
  const DURATION = 900;
  const t0 = performance.now();
  const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / DURATION);
    const e = ease(p);
    const to = measure(target); // live: Schriften und Scroll-Wiederherstellung können das Ziel noch verschieben
    o.style.left = `${m.x + (to.x - m.x) * e}px`;
    o.style.top = `${m.y + (to.y - m.y) * e}px`;
    o.style.width = `${m.w + (to.w - m.w) * e}px`;
    o.style.height = `${m.h + (to.h - m.h) * e}px`;
    o.style.borderRadius = `${m.rad + (radTo - m.rad) * e}px`;
    o.style.transform = `rotate(${m.rot + (rotTo - m.rot) * e}deg)`;
    if (p < 1) {
      requestAnimationFrame(tick);
      return;
    }
    target.classList.remove('morph-hide');
    const fade = o.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    void fade.finished.then(() => {
      o.remove();
      link?.classList.remove('on');
    });
  };
  requestAnimationFrame(tick);
}
runMorph();

// ── Seitenübergang vorbereiten: erstes Bild der Projektseite laden, sobald man eine Kachel anpeilt ──
{
  const warmed = new Set<string>();
  const keep: HTMLImageElement[] = [];
  const warm = (e: Event) => {
    const a = (e.target as Element).closest?.<HTMLElement>('[data-vt-srcset]');
    const srcset = a?.dataset.vtSrcset;
    if (!srcset || warmed.has(srcset)) return;
    warmed.add(srcset);
    const img = new Image();
    img.sizes = '(max-width: 900px) 90vw, 700px'; // wie der Streifen auf der Projektseite
    img.srcset = srcset;
    keep.push(img);
  };
  for (const ev of ['pointerover', 'focusin', 'touchstart'])
    document.addEventListener(ev, warm, { passive: true });
}

// ── CTA-Hover: Verlauf füllt kreisförmig von der Stelle, an der die Maus den Button betritt ──
for (const el of $$<HTMLElement>('.cta')) {
  el.addEventListener('pointerenter', (e) => {
    // Zieht sich die Füllung gerade noch zurück, bleibt ihr Mittelpunkt, sonst würde der Kreis springen
    if (parseFloat(getComputedStyle(el, '::before').getPropertyValue('--r')) > 1) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}

// ── Header: nach etwas Scrollen schrumpft die Leiste, die Navigation wird zur Pille ──
// Dann schweben Logo und Standort direkt über dem Inhalt: sie wechseln zwischen hell und dunkel, je nachdem,
// was gerade hinter ihnen liegt (Hintergrundfarbe oder Pixel eines Bildes oder Videos).
{
  const nav = $<HTMLElement>('.nav');
  const logo = $<HTMLElement>('.nav .mark');
  const loc = $<HTMLElement>('.nav .loc-text');
  const rgbOf = (css: string): { l: number; a: number } | null => {
    const m =
      /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(css) ??
      null;
    let r: number;
    let g: number;
    let b: number;
    let a: number;
    if (m) {
      [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      a = m[4] === undefined ? 1 : Number(m[4]);
    } else {
      const c = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(css);
      if (!c) return null;
      [r, g, b] = [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255];
      a = c[4] === undefined ? 1 : Number(c[4]);
    }
    return { l: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, a };
  };
  const thumbs = new WeakMap<Element, CanvasRenderingContext2D | null>();
  /** Helligkeit des Bildpunkts unter (x, y); berücksichtigt object-fit: cover. */
  const mediaLuma = (el: HTMLImageElement | HTMLVideoElement, x: number, y: number) => {
    const video = el instanceof HTMLVideoElement;
    const nw = video ? el.videoWidth : el.naturalWidth;
    const nh = video ? el.videoHeight : el.naturalHeight;
    if (!nw || !nh || (!video && !el.complete)) return null;
    let ctx = video ? undefined : thumbs.get(el);
    if (!ctx) {
      const cv = document.createElement('canvas');
      cv.width = 48;
      cv.height = Math.max(1, Math.round((48 * nh) / nw));
      ctx = cv.getContext('2d', { willReadFrequently: true });
      try {
        ctx?.drawImage(el, 0, 0, cv.width, cv.height);
        ctx?.getImageData(0, 0, 1, 1);
      } catch {
        ctx = null; // fremde Herkunft: nicht lesbar
      }
      if (!video) thumbs.set(el, ctx ?? null);
    }
    if (!ctx) return null;
    const r = el.getBoundingClientRect();
    const cover = getComputedStyle(el).objectFit === 'cover';
    const k = cover ? Math.max(r.width / nw, r.height / nh) : 0;
    const u = cover ? (x - r.left - (r.width - nw * k) / 2) / (nw * k) : (x - r.left) / r.width;
    const v = cover ? (y - r.top - (r.height - nh * k) / 2) / (nh * k) : (y - r.top) / r.height;
    const px = ctx.getImageData(
      Math.min(ctx.canvas.width - 1, Math.max(0, Math.floor(u * ctx.canvas.width))),
      Math.min(ctx.canvas.height - 1, Math.max(0, Math.floor(v * ctx.canvas.height))),
      1,
      1,
    ).data;
    return (0.2126 * px[0]! + 0.7152 * px[1]! + 0.0722 * px[2]!) / 255;
  };
  /** Helligkeit (0 dunkel bis 1 hell) dessen, was hinter dem Punkt liegt. */
  const lumaAt = (x: number, y: number): number => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (nav?.contains(el) || el.matches('.curtain, .morph, .progress, .preview-banner')) continue;
      if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) {
        const l = mediaLuma(el, x, y);
        if (l !== null) return l;
        continue;
      }
      const c = rgbOf(getComputedStyle(el).backgroundColor);
      if (c && c.a > 0.6) return c.l;
    }
    return root.classList.contains('light') ? 1 : 0;
  };
  const tones = new Map<HTMLElement, 'dark' | 'light'>();
  const ink = (el: HTMLElement | null, attr: string) => {
    if (!nav || !el || el.offsetParent === null) return;
    const r = el.getBoundingClientRect();
    const l = lumaAt(r.left + r.width / 2, r.top + r.height / 2);
    const before = tones.get(el);
    // Hysterese: erst deutlich hell oder dunkel wechselt die Farbe
    const next = l > 0.6 ? 'dark' : l < 0.42 ? 'light' : (before ?? (l > 0.5 ? 'dark' : 'light'));
    tones.set(el, next);
    nav.dataset[attr] = next;
  };
  let compact = false;
  let queued = 0;
  const paintInk = () => {
    queued = 0;
    if (!nav) return;
    if (!compact) {
      // Mit Leistenhintergrund gilt die Farbe des Themas
      delete nav.dataset.logo;
      delete nav.dataset.loc;
      tones.clear();
      return;
    }
    ink(logo, 'logo');
    ink(loc, 'loc');
  };
  const queueInk = () => {
    if (!queued) queued = requestAnimationFrame(paintInk);
  };
  const check = () => {
    // Hysterese: erst ab 120 px zusammenziehen, erst unter 40 px wieder öffnen (kein Flackern an der Schwelle)
    const next = compact ? scrollY > 40 : scrollY > 120;
    if (next !== compact) {
      compact = next;
      root.classList.toggle('nav-compact', compact);
    }
    queueInk();
  };
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', queueInk, { passive: true });
  // Bilder laden nach: dann kann sich der Untergrund hinter dem Logo ändern
  document.addEventListener('load', queueInk, { capture: true });
  // Videos laufen weiter: gelegentlich neu messen
  setInterval(() => {
    if (compact && !document.hidden) queueInk();
  }, 600);
  check();
}

// ── Projekt-Leiste unten: erscheint nach dem Hero, weicht Demo, "Nächstes Projekt", Abschluss und Footer ──
{
  const dock = $<HTMLElement>('[data-dock]');
  const hero = $('main > section');
  if (dock && hero) {
    let pastHero = false;
    const blockers = new Set<Element>();
    const paint = () => dock.classList.toggle('on', pastHero && blockers.size === 0);
    new IntersectionObserver(
      ([en]) => {
        pastHero = !!en && !en.isIntersecting && en.boundingClientRect.top < 0;
        paint();
      },
      { threshold: 0 },
    ).observe(hero);
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) blockers.add(en.target);
        else blockers.delete(en.target);
      }
      paint();
    });
    $$('.demo, .next, .footer, .pfu').forEach((el) => io.observe(el));
  }
}

// ── Mobile-Menü ──────────────────────────────────────────────────────
const menu = $<HTMLElement>('#menu');
const menuBtn = $<HTMLButtonElement>('[data-menu-open]');
function setMenu(open: boolean) {
  menu?.setAttribute('data-open', String(open));
  menuBtn?.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) $<HTMLElement>('[data-menu-close]')?.focus();
  else menuBtn?.focus();
}
menuBtn?.addEventListener('click', () => setMenu(true));
$('[data-menu-close]')?.addEventListener('click', () => setMenu(false));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menu?.dataset.open === 'true') setMenu(false);
});
menu?.addEventListener('click', (e) => {
  if ((e.target as Element).closest('a[href^="#"]')) setMenu(false);
});

// ── Standort im Header: Scramble zu Koordinaten beim Scrollen / Hover ─
const loc = $<HTMLElement>('[data-location]');
const locText = $<HTMLElement>('[data-location-text]');
if (loc && locText) {
  const textA = loc.dataset.textA ?? '';
  const textB = loc.dataset.textB ?? '';
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const KEEP = new Set([' ', ',', '.', '°']);
  const SCRAMBLE = 550; // ms, die Zeichen flackern
  const STAGGER = 38; // ms Versatz pro Zeichen
  let state: 'A' | 'B' = 'B';
  let hovering = false;
  let frozen = false;
  let raf = 0;
  let stopTimer = 0;

  locText.classList.add('is-intro');

  function scrambleTo(target: string) {
    cancelAnimationFrame(raf);
    if (frozen) {
      locText!.textContent = target;
      return;
    }
    if (reduced) {
      locText!.textContent = target;
      return;
    }
    const total = SCRAMBLE + (target.length - 1) * STAGGER;
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      let out = '';
      for (let i = 0; i < target.length; i++) {
        const ch = target[i]!;
        out +=
          elapsed >= i * STAGGER + SCRAMBLE || KEEP.has(ch)
            ? ch
            : CHARSET[Math.floor(Math.random() * CHARSET.length)];
      }
      locText!.textContent = out;
      if (elapsed < total) raf = requestAnimationFrame(step);
      else locText!.textContent = target;
    };
    raf = requestAnimationFrame(step);
  }
  function setState(next: 'A' | 'B') {
    if (next === state) return;
    state = next;
    scrambleTo(next === 'A' ? textA : textB);
  }
  function activate() {
    locText!.classList.remove('is-intro');
  }
  addEventListener(
    'scroll',
    () => {
      if (hovering || frozen) return;
      activate();
      setState('A');
      clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => {
        if (!hovering) setState('B');
      }, 220);
    },
    { passive: true },
  );
  // Beginnt ein Seitenwechsel, steht der Standort still: keine laufende Animation neben Welle und View Transition
  document.addEventListener('serend:resume', () => {
    frozen = false;
  });
  document.addEventListener('serend:leave', () => {
    frozen = true;
    cancelAnimationFrame(raf);
    clearTimeout(stopTimer);
    state = 'B';
    locText.textContent = textB;
  });
  loc.addEventListener('mouseenter', () => {
    if (frozen) return;
    hovering = true;
    clearTimeout(stopTimer);
    activate();
    setState('A');
  });
  loc.addEventListener('mouseleave', () => {
    hovering = false;
    setState('B');
  });
}

// ── Videos (Cover, Galerie, Inhaltsbilder): nur im Sichtfeld abspielen; bei reduzierter Bewegung bleibt das erste Bild ──
{
  const videos = $$<HTMLVideoElement>('video[data-autoplay]');
  if (videos.length > 0 && !reduced) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) void v.play().catch(() => {});
          else v.pause();
        }
      },
      { rootMargin: '80px' },
    );
    videos.forEach((v) => io.observe(v));
  }
}

// ── Projekt-Kacheln: „Ansehen" ersetzt den Mauszeiger und folgt ihm ───
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const HALF = 48; // halbe Kreisbreite, entspricht .look in global.css
  $$<HTMLElement>('.tile').forEach((tile) => {
    const look = $<HTMLElement>('.look', tile);
    if (!look) return;
    tile.classList.add('follow');
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const paint = () => {
      look.style.setProperty('--lx', `${x + HALF}px`);
      look.style.setProperty('--ly', `${y + HALF}px`);
    };
    const tick = () => {
      // sanftes Nachziehen; bei reduzierter Bewegung direkt am Zeiger
      x += (tx - x) * (reduced ? 1 : 0.22);
      y += (ty - y) * (reduced ? 1 : 0.22);
      paint();
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const target = (e: PointerEvent) => {
      const r = tile.getBoundingClientRect();
      tx = e.clientX - r.left - HALF;
      ty = e.clientY - r.top - HALF;
    };
    tile.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      target(e);
      x = tx;
      y = ty;
      paint();
      tile.classList.add('on');
    });
    tile.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      target(e);
      if (!raf) raf = requestAnimationFrame(tick);
    });
    tile.addEventListener('pointerleave', () => {
      tile.classList.remove('on');
    });
  });
}

// ── Anfrage-Modal: Vollbild-Dialog, öffnet als Kreis vom Button aus ──
const inquiry = $<HTMLDialogElement>('#inquiry');
if (inquiry && typeof inquiry.showModal === 'function') {
  const form = $<HTMLFormElement>('[data-inquiry-form]', inquiry)!;
  const status = $<HTMLElement>('[data-inquiry-status]', inquiry)!;
  const submit = $<HTMLButtonElement>('[data-inquiry-submit]', inquiry)!;
  const submitLabel = $<HTMLElement>('.lbl', submit)!;
  const done = $<HTMLElement>('[data-inquiry-done]', inquiry)!;
  const idleLabel = submitLabel.textContent ?? '';
  let origin: HTMLElement | null = null;
  let closing = false;

  function setOrigin() {
    // Kreis wächst aus der Mitte des auslösenden Buttons (Tastatur: ebenfalls Button-Mitte)
    const r = origin?.getBoundingClientRect();
    const x = r ? r.left + r.width / 2 : innerWidth / 2;
    const y = r ? r.top + r.height / 2 : 0;
    const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
    inquiry!.style.setProperty('--ox', `${x}px`);
    inquiry!.style.setProperty('--oy', `${y}px`);
    inquiry!.style.setProperty('--or', `${radius}px`);
  }
  function openInquiry(trigger: HTMLElement | null) {
    if (inquiry!.open) return;
    origin = trigger;
    closing = false;
    setOrigin();
    inquiry!.dataset.state = 'closed';
    inquiry!.showModal();
    document.body.style.overflow = 'hidden';
    void inquiry!.offsetWidth; // Startzustand festschreiben, damit die Transition läuft
    inquiry!.dataset.state = 'open';
  }
  function finishClose() {
    inquiry!.close();
    inquiry!.dataset.state = 'closed';
    document.body.style.overflow = '';
    closing = false;
    if (!done.hidden) {
      // Nach erfolgreichem Absenden das Formular für die nächste Anfrage zurücksetzen
      done.hidden = true;
      form.hidden = false;
      form.reset();
    }
  }
  function closeInquiry() {
    if (!inquiry!.open || closing) return;
    closing = true;
    setOrigin();
    inquiry!.dataset.state = 'closing';
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      finishClose();
    };
    inquiry!.addEventListener(
      'transitionend',
      (e) => {
        if (e.target === inquiry) end();
      },
      { once: true },
    );
    setTimeout(end, 800); // Fallback, falls keine Transition läuft
  }

  $$<HTMLElement>('[data-inquiry-open]').forEach((el) =>
    el.addEventListener('click', (e) => {
      // Strg/Cmd/Shift-Klick und Mittelklick behalten das Link-Verhalten
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openInquiry(el);
    }),
  );
  $$<HTMLElement>('[data-inquiry-close]', inquiry).forEach((el) =>
    el.addEventListener('click', closeInquiry),
  );
  // Esc: animiert schließen statt hart zu springen
  inquiry.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeInquiry();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    status.textContent = '';
    submit.disabled = true;
    submitLabel.textContent = form.dataset.sending ?? '';
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: String(f.get('name') ?? ''),
          email: String(f.get('email') ?? ''),
          message: String(f.get('message') ?? ''),
          locale: inquiry.dataset.locale ?? 'de',
          consent: f.get('consent') === 'on',
          website: String(f.get('website') ?? ''),
        }),
      });
      if (!res.ok) {
        status.textContent =
          (res.status === 429 ? form.dataset.errorRate : form.dataset.error) ?? '';
        return;
      }
      form.hidden = true;
      done.hidden = false;
      done.focus({ preventScroll: true });
    } catch {
      status.textContent = form.dataset.error ?? '';
    } finally {
      submit.disabled = false;
      submitLabel.textContent = idleLabel;
    }
  });
}

// ── Fallbacks für Browser ohne scroll-driven Animations ──────────────
if (!CSS.supports('animation-timeline: scroll()')) {
  const progress = $<HTMLElement>('.progress');
  const rail = $<HTMLElement>('.rail i');
  const update = () => {
    const p = Math.min(1, scrollY / Math.max(1, root.scrollHeight - innerHeight));
    progress?.style.setProperty('--p', String(p));
    rail?.style.setProperty('--p', String(p));
  };
  addEventListener('scroll', update, { passive: true });
  update();
}
if (!CSS.supports('animation-timeline: view()')) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries)
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
    },
    { threshold: 0.12 },
  );
  $$('.reveal').forEach((el) => io.observe(el));
}

// ── Kapitel-Navigation: aktives Kapitel markieren ────────────────────
const chapterLinks = $$<HTMLAnchorElement>('[data-chapter-nav] a');
if (chapterLinks.length > 0) {
  const targets = chapterLinks
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter((x): x is HTMLElement => !!x);
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        chapterLinks.forEach((a) =>
          a.toggleAttribute('aria-current', a.hash === `#${en.target.id}`),
        );
      }
    },
    { rootMargin: '-30% 0px -60% 0px' },
  );
  targets.forEach((t) => io.observe(t));
}

// ── Bildstrecken: mit der Maus ziehen (Touch scrollt nativ), mit Schwung nach dem Loslassen ──────
for (const strip of $$<HTMLElement>('.strip')) {
  let startX = 0;
  let startLeft = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let moved = false;
  let down = false;
  let raf = 0;
  const stop = () => cancelAnimationFrame(raf);
  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    stop();
    startX = lastX = e.clientX;
    startLeft = strip.scrollLeft;
    lastT = e.timeStamp;
    velocity = 0;
    moved = false;
    down = true;
    strip.setPointerCapture(e.pointerId);
    strip.classList.add('dragging');
  });
  strip.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) < 4) return;
    moved = true;
    strip.scrollLeft = startLeft - dx;
    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (lastX - e.clientX) / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;
  });
  const release = (e: PointerEvent) => {
    if (!down) return;
    down = false;
    if (strip.hasPointerCapture(e.pointerId)) strip.releasePointerCapture(e.pointerId);
    // Schwung: Geschwindigkeit klingt ab, danach rastet die Leiste (scroll-snap) auf das nächste Bild ein
    let v = e.timeStamp - lastT > 80 ? 0 : Math.max(-60, Math.min(60, velocity * 16));
    const glide = () => {
      v *= 0.94;
      const before = strip.scrollLeft;
      strip.scrollLeft += v;
      if (Math.abs(v) > 0.5 && strip.scrollLeft !== before && !reduced)
        raf = requestAnimationFrame(glide);
      else strip.classList.remove('dragging');
    };
    glide();
  };
  strip.addEventListener('pointerup', release);
  strip.addEventListener('pointercancel', release);
  // Ein Zug soll keinen Klick auslösen (z. B. auf ein Bild mit Link)
  strip.addEventListener(
    'click',
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );
}

// ── Projektübersicht: Filter, Raster/Liste ───────────────────────────
const index = $<HTMLElement>('[data-project-index]');
if (index) {
  const grid = $<HTMLElement>('.pgrid', index)!;
  const list = $<HTMLElement>('.plist', index)!;
  const tabs = $$<HTMLButtonElement>('[data-filter]', index);
  const viewBtns = $$<HTMLButtonElement>('[data-view-btn]', index);
  const seg = $<HTMLElement>('.seg', index)!;
  const count = $<HTMLElement>('[data-count]', index)!;
  const total = Number(index.dataset.total);
  const ratios = ['4 / 5', '1 / 1', '4 / 5'];
  const offsets = ['0px', '64px', '24px'];
  const params = new URLSearchParams(location.search);
  let filter = params.get('bereich') ?? 'all';
  if (!tabs.some((t) => t.dataset.filter === filter)) filter = 'all';
  let view =
    (params.get('ansicht') === 'list'
      ? 'list'
      : params.get('ansicht') === 'grid'
        ? 'grid'
        : index.dataset.defaultView) ?? 'grid';

  function restart(el: HTMLElement, delay: number) {
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    el.style.animationDelay = `${(delay * 0.05).toFixed(2)}s`;
  }
  function apply(animate: boolean) {
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.filter === filter)));
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === view)));
    seg.dataset.view = view;
    grid.hidden = view !== 'grid';
    list.hidden = view !== 'list';
    let shown = 0;
    for (const container of [grid, list]) {
      let i = 0;
      for (const item of $$<HTMLElement>('[data-cats]', container)) {
        const match = filter === 'all' || (item.dataset.cats ?? '').split(' ').includes(filter);
        item.hidden = !match;
        if (!match) continue;
        if (container === grid) {
          item.style.marginTop = offsets[i % 3]!;
          const ph = $<HTMLElement>('.ph', item);
          if (ph) ph.style.aspectRatio = ratios[i % 3]!;
        } else {
          const nr = $('.nr', item);
          if (nr) nr.textContent = String(i + 1).padStart(2, '0');
        }
        if (animate) restart(item, i);
        i++;
      }
      shown = i;
    }
    count.textContent = `${shown} / ${total}`;
  }
  function remember() {
    const u = new URL(location.href);
    if (filter === 'all') u.searchParams.delete('bereich');
    else u.searchParams.set('bereich', filter);
    u.searchParams.delete('ansicht');
    history.replaceState(null, '', u);
  }
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      filter = t.dataset.filter ?? 'all';
      apply(true);
      remember();
    }),
  );
  viewBtns.forEach((b) =>
    b.addEventListener('click', () => {
      view = b.dataset.viewBtn ?? 'grid';
      apply(true);
    }),
  );
  apply(false);
}
