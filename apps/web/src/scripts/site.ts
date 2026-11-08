/** Minimales Client-Script (kein Framework): Theme, Sprache, Seitenübergang, Menü, Anfrage-Modal, Projektfilter, Kapitel-Navigation. */
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
addEventListener('pageshow', (e) => {
  if (e.persisted) curtain?.classList.remove('leaving');
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
  leave(url.href);
});

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
  let raf = 0;
  let stopTimer = 0;

  locText.classList.add('is-intro');

  function scrambleTo(target: string) {
    cancelAnimationFrame(raf);
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
      if (hovering) return;
      activate();
      setState('A');
      clearTimeout(stopTimer);
      stopTimer = window.setTimeout(() => {
        if (!hovering) setState('B');
      }, 220);
    },
    { passive: true },
  );
  loc.addEventListener('mouseenter', () => {
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
