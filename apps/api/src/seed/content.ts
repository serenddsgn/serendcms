/**
 * Beispielinhalte aus dem Design-Prototyp (design/prototype/*.html, design/images).
 * Alle Texte stammen 1:1 aus dem Prototyp; für die übrigen elf Projekte gibt es im Design keine
 * Detailtexte, sie werden nur mit Stammdaten und Cover angelegt.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Database } from '@serend/db';
import type { Inline, Locale } from '@serend/schema';
import { ROUTE_SEGMENTS, stripEmphasis } from '@serend/schema';
import { siteRepo } from '../repositories/site.repo.js';
import type { MediaService } from '../services/media.service.js';
import type { PagesService } from '../services/pages.service.js';
import type { ProjectsService } from '../services/projects.service.js';

export interface SeedDeps {
  db: Database;
  media: MediaService;
  projects: ProjectsService;
  pages: PagesService;
  actorId: string;
  imagesDir: string;
}

type Cat = 'web' | 'shop' | 'brand' | 'print';
const run = (text: string, liquid = false) => ({ text, ...(liquid && { liquid: true }) });

const PROJECTS: {
  slug: string;
  title: string;
  cats: Cat[];
  year: number;
  color: string;
  tile?: string;
  cover: string;
  featured?: number;
}[] = [
  {
    slug: 'dolce-falcone',
    title: 'Dolce & Falcone',
    cats: ['shop'],
    year: 2026,
    color: '#66a903',
    tile: '#303030',
    cover: 'dolce-falcone-cover.jpg',
    featured: 1,
  },
  {
    slug: 'schramowski-getraenke',
    title: 'Schramowski Getränke',
    cats: ['web'],
    year: 2025,
    color: '#deb633',
    tile: '#ddb533',
    cover: 'schramowski-cover.jpg',
    featured: 3,
  },
  {
    slug: 'cista',
    title: 'Cista',
    cats: ['web'],
    year: 2025,
    color: '#d9b66d',
    tile: '#412812',
    cover: 'cista-cover.jpg',
    featured: 4,
  },
  {
    slug: 'ip-nrw',
    title: 'IP NRW',
    cats: ['web'],
    year: 2026,
    color: '#91120e',
    cover: 'ip-nrw-cover.jpg',
  },
  {
    slug: 'catering-borghs',
    title: 'Catering Borghs',
    cats: ['web'],
    year: 2026,
    color: '#ba1f2a',
    tile: '#ba1f29',
    cover: 'catering-borghs-cover.jpg',
    featured: 0,
  },
  {
    slug: 'oxe-werbedesign',
    title: 'Oxé Werbedesign',
    cats: ['web'],
    year: 2024,
    color: '#d20c05',
    cover: 'oxe-werbedesign-cover.jpg',
  },
  {
    slug: 'giegt-b2b',
    title: 'GIEGT B2B',
    cats: ['brand', 'shop'],
    year: 2025,
    color: '#45af29',
    cover: 'giegt-b2b-cover.jpg',
  },
  {
    slug: 'suchthilfe-wuppertal',
    title: 'Suchthilfe Wuppertal',
    cats: ['brand', 'print', 'web'],
    year: 2025,
    color: '#ba2849',
    tile: '#b62042',
    cover: 'suchthilfe-wuppertal-cover.jpg',
    featured: 2,
  },
  {
    slug: 'cardex-autoteile',
    title: 'Cardex Autoteile',
    cats: ['brand', 'web'],
    year: 2026,
    color: '#ff6601',
    cover: 'cardex-autoteile-cover.jpg',
  },
  {
    slug: 'sachxpert',
    title: 'SachXpert',
    cats: ['brand', 'print', 'web'],
    year: 2026,
    color: '#78b72b',
    cover: 'sachxpert-cover.jpg',
  },
  {
    slug: 'rainbow-park',
    title: 'Rainbow Park',
    cats: ['brand', 'print', 'web'],
    year: 2023,
    color: '#8ab92e',
    cover: 'rainbow-park-cover.jpg',
  },
  {
    slug: 'mycocktailtaxi',
    title: 'MyCocktailTaxi',
    cats: ['shop', 'web'],
    year: 2024,
    color: '#f7cd42',
    cover: 'mycocktailtaxi-cover.jpg',
  },
];

const GALLERY = [
  {
    file: 'dolce-falcone-hero.jpg',
    alt: { de: 'Konfigurator auf dem Tablet', en: 'Configurator on a tablet' },
  },
  { file: 'dolce-falcone-gallery-02.jpg', alt: { de: 'Produktdetail', en: 'Product detail' } },
  {
    file: 'dolce-falcone-cover.jpg',
    alt: { de: 'Shop im Hochformat', en: 'Shop in portrait format' },
  },
  {
    file: 'dolce-falcone-gallery-03.jpg',
    alt: { de: 'Boxgröße wählen', en: 'Choosing the box size' },
  },
  { file: 'dolce-falcone-gallery-04.jpg', alt: { de: 'Shop-Übersicht', en: 'Shop overview' } },
];

/** Detailtexte von Dolce & Falcone (prototype/detail.html). */
const DF: Record<
  Locale,
  {
    subtitle: Inline;
    client: string;
    chapters: { title: string; lead: string; p: string }[];
    quote: [string, string];
    demo: { eyebrow: string; title: string; names: string[] };
  }
> = {
  de: {
    subtitle: [
      run('Die digitale '),
      run('Gebäcktheke', true),
      run(': ein Shop, der den Kaufmoment versteht.'),
    ],
    client: 'Dolce & Falcone, Pasticceria',
    chapters: [
      {
        title: 'Um wen es geht',
        lead: 'Dolce & Falcone ist eine italienische Pasticceria aus Wuppertal. Bekannt für handgemachtes Mandelgebäck, Crostatine und kleine Spezialitäten, die im Laden Stück für Stück ausgesucht werden.',
        p: 'Genau dieses Aussuchen ist Teil des Produkts.',
      },
      {
        title: 'Die Aufgabe',
        lead: 'Dolce & Falcone wollte online verkaufen, ohne das Ladengeschäft zu verlieren.',
        p: 'Kunden sollten sich ihre Gebäckschachtel selbst zusammenstellen können: feste Stückzahl, freie Mischung, unterschiedliche Preise pro Stück, Allergene, Zutaten und Nährwerte direkt an jedem Produkt. Ein Standard-Shop kann einzelne Artikel verkaufen. Er kann auch Varianten abbilden. Aber er versteht keine Gebäcktheke.',
      },
      {
        title: 'Was wir gebaut haben',
        lead: 'Ein eigener Pick&Mix-Konfigurator.',
        p: 'Kunden wählen zuerst die Boxgröße. Danach stellen sie ihre Schachtel aus den einzelnen Gebäcken zusammen, mit Plus- und Minus-Steuerung, eigenem Stückpreis und Detailinformationen. Der Konfigurator zählt in Echtzeit mit: wie viele Stücke schon in der Box liegen, wie viele noch fehlen und was die Auswahl kostet.',
      },
      {
        title: 'Was sich ändert',
        lead: 'Der Online-Shop verkauft nicht nur Gebäck. Er bildet den eigentlichen Kaufmoment ab: aussuchen, mischen, prüfen, abschließen.',
        p: 'Das ist kein „schönerer“ Shop. Es ist die digitale Gebäcktheke.',
      },
    ],
    quote: ['Das Problem war nicht der Shop.', 'Das Problem war die Box.'],
    demo: {
      eyebrow: 'Ausprobieren · Nachbau mit Beispielsorten und -preisen',
      title: 'Stellen Sie Ihre Box zusammen.',
      names: ['Mandelgebäck', 'Crostatina', 'Pistazie', 'Amaretto'],
    },
  },
  en: {
    subtitle: [
      run('The digital '),
      run('pastry counter', true),
      run(': a shop that understands the moment of purchase.'),
    ],
    client: 'Dolce & Falcone, pasticceria',
    chapters: [
      {
        title: 'Who it’s about',
        lead: 'Dolce & Falcone is an Italian pasticceria in Wuppertal. Known for handmade almond pastries, crostatine and small specialities that customers pick out piece by piece in the shop.',
        p: 'That picking is part of the product.',
      },
      {
        title: 'The brief',
        lead: 'Dolce & Falcone wanted to sell online without losing what makes the shop.',
        p: 'Customers should be able to build their own pastry box: a fixed number of pieces, a free mix, different prices per piece, and allergens, ingredients and nutrition right on every product. A standard shop can sell single items. It can handle variants. But it doesn’t understand a pastry counter.',
      },
      {
        title: 'What we built',
        lead: 'A custom Pick&Mix configurator.',
        p: 'Customers first choose the box size. Then they fill it with individual pastries, using plus and minus controls, a price per piece and detailed information. The configurator counts along in real time: how many pieces are in the box, how many are missing and what the selection costs.',
      },
      {
        title: 'What changes',
        lead: 'The online shop doesn’t just sell pastries. It recreates the real moment of purchase: choose, mix, check, done.',
        p: 'It isn’t a “prettier” shop. It’s the digital pastry counter.',
      },
    ],
    quote: ['The problem wasn’t the shop.', 'The problem was the box.'],
    demo: {
      eyebrow: 'Try it · rebuilt with sample flavours and prices',
      title: 'Build your box.',
      names: ['Almond pastry', 'Crostatina', 'Pistachio', 'Amaretto'],
    },
  },
};

const FLAVORS = [
  { key: 'mandel', priceCents: 160, color: '#e0a98f' },
  { key: 'crostatina', priceCents: 220, color: '#b06bb4' },
  { key: 'pistazie', priceCents: 190, color: '#7fa66b' },
  { key: 'amaretto', priceCents: 180, color: '#5d6b93' },
];

const SERVICES: Record<Locale, { key: Cat; name: string; description: string }[]> = {
  de: [
    {
      key: 'web',
      name: 'Webdesign',
      description:
        'Individuelle Funktionen statt Baukasten: Konfiguratoren, Buchungen, Portale. In WordPress oder React.',
    },
    {
      key: 'shop',
      name: 'E-Commerce',
      description: 'Shops, die den echten Kaufmoment abbilden, nicht nur Produkte listen.',
    },
    {
      key: 'brand',
      name: 'Branding',
      description: 'Zeichen, Farbe, Schrift und Haltung, die online und auf Papier gleich klingen.',
    },
    {
      key: 'print',
      name: 'Druckbares',
      description: 'Plakate, Flyer, Geschäftsausstattung: aus demselben System wie die Website.',
    },
  ],
  en: [
    {
      key: 'web',
      name: 'Web design',
      description:
        'Custom features instead of templates: configurators, bookings, portals. In WordPress or React.',
    },
    {
      key: 'shop',
      name: 'E-commerce',
      description: 'Shops that capture the real moment of purchase, not just list products.',
    },
    {
      key: 'brand',
      name: 'Branding',
      description: 'Marks, colour, type and attitude that sound the same online and on paper.',
    },
    {
      key: 'print',
      name: 'Print',
      description: 'Posters, flyers, stationery: from the same system as the website.',
    },
  ],
};

const SITE: Record<
  Locale,
  {
    hero: { eyebrow: string; lines: Inline[]; intro: string; link: string };
    servicesEyebrow: string;
    servicesTitle: string;
    selected: string;
    allProjects: string;
    card: { badge: string; eyebrow: string; why: string; text: string; link: string; alt: string };
    contact: { eyebrow: string; l1: string; l2: string };
    projectsTitle: string;
    projectsIntro: string;
    cta: string;
    city: string;
    madeWith: string;
    nav: { work: string; services: string; studio: string };
    legal: { imprint: string; privacy: string };
    homeTitle: string;
  }
> = {
  de: {
    hero: {
      eyebrow: 'Designstudio Wuppertal',
      lines: [
        [run('Wir gestalten nicht nur,')],
        [run('um '), run('Oberflächen', true)],
        [run('zu füllen.')],
      ],
      intro:
        'Wir entwickeln Webseiten mit **individuellen Funktionen**, die genau auf Ihr **Geschäftsmodell** zugeschnitten sind. Damit Ihre Website mehr leistet, als nur zu repräsentieren. Sie soll **arbeiten. Verkaufen. Organisieren.**',
      link: 'Was wir machen',
    },
    servicesEyebrow: 'Was wir machen',
    servicesTitle: 'Eine Website soll arbeiten. Also bauen wir sie so.',
    selected: 'Ausgewählte Arbeiten',
    allProjects: 'Alle Projekte ansehen',
    card: {
      badge: 'Im Studio, Wuppertal',
      eyebrow: 'Präambel',
      why: 'Warum',
      text: 'Wir heißen serend.design®, weil wir an die Idee der Serendipität glauben. An diesen besonderen Moment, in dem man etwas findet, wonach man nicht exakt gesucht hat — und trotzdem sofort spürt, dass es richtig ist.',
      link: 'Unsere Design-Philosophie',
      alt: 'Porträt im serend.design Studio in Wuppertal',
    },
    contact: { eyebrow: 'Lass uns reden', l1: 'Großartiges', l2: 'erstellen.' },
    projectsTitle: 'Arbeiten',
    projectsIntro: 'Webseiten, Shops, Marken und Drucksachen. 2023 bis heute, aus Wuppertal.',
    cta: 'Projekt anfragen',
    city: 'Wuppertal, Deutschland',
    madeWith: 'Gemacht mit Hingabe in Wuppertal',
    nav: { work: 'Arbeiten', services: 'Leistungen', studio: 'Studio' },
    legal: { imprint: 'Impressum', privacy: 'Datenschutz' },
    homeTitle: 'Startseite',
  },
  en: {
    hero: {
      eyebrow: 'Design studio, Wuppertal',
      lines: [[run('We don’t just design')], [run('to fill '), run('surfaces', true), run('.')]],
      intro:
        'We build websites with **custom functionality**, tailored precisely to your **business model**. So your website does more than represent you. It should **work. Sell. Organise.**',
      link: 'What we do',
    },
    servicesEyebrow: 'What we do',
    servicesTitle: 'A website should work. So that’s how we build it.',
    selected: 'Selected work',
    allProjects: 'View all projects',
    card: {
      badge: 'In the studio, Wuppertal',
      eyebrow: 'Preamble',
      why: 'Why',
      text: 'We’re called serend.design® because we believe in the idea of serendipity. That special moment when you find something you weren’t exactly looking for — and instantly feel it’s right.',
      link: 'Our design philosophy',
      alt: 'Portrait in the serend.design studio in Wuppertal',
    },
    contact: { eyebrow: 'Let’s talk', l1: 'Let’s build', l2: 'something great.' },
    projectsTitle: 'Work',
    projectsIntro: 'Websites, shops, brands and print. 2023 to today, from Wuppertal.',
    cta: 'Start a project',
    city: 'Wuppertal, Germany',
    madeWith: 'Made with devotion in Wuppertal',
    nav: { work: 'Work', services: 'Services', studio: 'Studio' },
    legal: { imprint: 'Imprint', privacy: 'Privacy' },
    homeTitle: 'Home',
  },
};

export async function seedContent(d: SeedDeps): Promise<void> {
  const site = siteRepo(d.db);
  const files = new Map<string, string>(); // Dateiname → Media-ID

  async function image(file: string, alt: { de: string; en: string }): Promise<string> {
    const key = `${file}|${alt.de}`;
    const known = files.get(key);
    if (known) return known;
    const buf = await readFile(join(d.imagesDir, file));
    const m = await d.media.upload(d.actorId, file, buf);
    await d.media.update(m.id, { altText: alt });
    files.set(key, m.id);
    return m.id;
  }

  const locales: Locale[] = ['de', 'en'];
  const ids: Record<Locale, Record<string, string>> = { de: {}, en: {} };

  // ── Projekte ────────────────────────────────────────────────────
  for (const p of PROJECTS) {
    const cover = await image(p.cover, { de: p.title, en: p.title });
    let groupId: string | undefined;
    for (const locale of locales) {
      const detail = await d.projects.create(d.actorId, {
        locale,
        ...(groupId && { translationGroupId: groupId }),
        featured: p.featured !== undefined,
        slug: p.slug,
        title: p.title,
        subtitle: null,
        year: p.year,
        categories: p.cats,
        color: p.color,
        tileColor: p.tile ?? null,
        client: null,
        liveUrl: null,
        coverMediaId: cover,
        nextProjectId: null,
        content: [],
        gallery: [],
        seoTitle: null,
        seoDescription: null,
        ogMediaId: null,
      });
      groupId = detail.project.translationGroupId;
      ids[locale][p.slug] = detail.project.id;
      if (p.featured !== undefined)
        await d.projects.update(detail.project.id, {
          featured: true,
          featuredSortOrder: p.featured,
        });
    }
  }

  // Dolce & Falcone: vollständige Detailseite
  for (const locale of locales) {
    const t = DF[locale];
    const df = PROJECTS[0]!;
    const detail = await d.projects.get(ids[locale][df.slug]!);
    const gallery = [];
    for (const g of GALLERY) {
      // Das Cover ist dasselbe Bild wie das dritte Galeriebild: Medium wiederverwenden, Alt-Text überschreiben.
      if (g.file === df.cover)
        gallery.push({ mediaId: detail.latest.coverMediaId!, altOverride: g.alt[locale] });
      else gallery.push({ mediaId: await image(g.file, g.alt), altOverride: null });
    }
    const demo = {
      id: randomUUID(),
      type: 'interactive_demo' as const,
      navLabel: locale === 'de' ? 'Ausprobieren' : 'Try it',
      demo: {
        component: 'pick-and-mix' as const,
        eyebrow: t.demo.eyebrow,
        title: t.demo.title,
        sizes: [12, 18, 24, 46],
        defaultSize: 12,
        flavors: FLAVORS.map((f, i) => ({ ...f, name: t.demo.names[i]! })),
        initial: { mandel: 4, crostatina: 3, pistazie: 0, amaretto: 2 },
      },
    };
    const chapter = (i: number) => ({
      id: randomUUID(),
      type: 'chapter' as const,
      title: t.chapters[i]!.title,
      lead: [run(t.chapters[i]!.lead)],
      body: [[run(t.chapters[i]!.p)]],
    });
    await d.projects.saveDraft(d.actorId, detail.project.id, {
      slug: df.slug,
      title: df.title,
      subtitle: t.subtitle,
      year: df.year,
      categories: df.cats,
      color: df.color,
      tileColor: df.tile ?? null,
      client: t.client,
      liveUrl: 'https://dolce-falcone.de',
      coverMediaId: detail.latest.coverMediaId,
      nextProjectId: ids[locale]['mycocktailtaxi']!,
      content: [
        chapter(0),
        chapter(1),
        { id: randomUUID(), type: 'quote', lines: [[run(t.quote[0])], [run(t.quote[1], true)]] },
        chapter(2),
        demo,
        chapter(3),
      ],
      gallery,
      seoTitle: null,
      seoDescription: null,
      ogMediaId: null,
    });
  }
  for (const locale of locales)
    for (const id of Object.values(ids[locale])) await d.projects.publish(id);

  // ── Seiten ──────────────────────────────────────────────────────
  const portrait = await image('studio-portrait.jpg', {
    de: SITE.de.card.alt,
    en: SITE.en.card.alt,
  });
  await d.media.update(portrait, { focalX: 30, focalY: 40 });
  const pageIds = {
    de: {
      home: randomUUID(),
      projects: randomUUID(),
      imprint: randomUUID(),
      privacy: randomUUID(),
    },
    en: {
      home: randomUUID(),
      projects: randomUUID(),
      imprint: randomUUID(),
      privacy: randomUUID(),
    },
  };
  const groups = {
    home: randomUUID(),
    projects: randomUUID(),
    imprint: randomUUID(),
    privacy: randomUUID(),
  };

  for (const locale of locales) {
    const s = SITE[locale];
    const pid = pageIds[locale];
    const home = (fragment?: string) => ({
      kind: 'page' as const,
      pageId: pid.home,
      ...(fragment && { fragment }),
    });
    await d.pages.create(d.actorId, {
      id: pid.projects,
      locale,
      systemKey: 'projects',
      translationGroupId: groups.projects,
      slug: ROUTE_SEGMENTS[locale].projects,
      title: s.projectsTitle,
      seoTitle: null,
      seoDescription: s.projectsIntro,
      ogMediaId: null,
      content: [
        {
          id: randomUUID(),
          type: 'page_title',
          title: s.projectsTitle,
          showCount: true,
          intro: s.projectsIntro,
        },
        { id: randomUUID(), type: 'project_index', defaultView: 'grid' },
      ],
    });
    await d.pages.create(d.actorId, {
      id: pid.home,
      locale,
      systemKey: 'home',
      translationGroupId: groups.home,
      slug: 'home',
      title: s.homeTitle,
      seoTitle: null,
      seoDescription: null,
      ogMediaId: null,
      content: [
        {
          id: randomUUID(),
          type: 'hero',
          eyebrow: s.hero.eyebrow,
          headline: s.hero.lines,
          intro: s.hero.intro,
          link: { label: s.hero.link, target: home('leistungen') },
        },
        {
          id: randomUUID(),
          type: 'featured_projects',
          label: s.selected,
          allProjectsLink: { label: s.allProjects, target: { kind: 'page', pageId: pid.projects } },
        },
        {
          id: randomUUID(),
          type: 'services_overview',
          anchor: 'leistungen',
          eyebrow: s.servicesEyebrow,
          title: [run(s.servicesTitle)],
        },
        {
          id: randomUUID(),
          type: 'media_text_card',
          anchor: 'praeambel',
          mediaId: portrait,
          badge: s.card.badge,
          eyebrow: s.card.eyebrow,
          heading: [run(`${s.card.why} `), run('serend', true), run('?')],
          text: s.card.text,
          link: { label: s.card.link, target: home('praeambel') },
        },
        {
          id: randomUUID(),
          type: 'contact_cta',
          anchor: 'kontakt',
          eyebrow: s.contact.eyebrow,
          line1: s.contact.l1,
          line2: s.contact.l2,
        },
      ],
    });
    await d.pages.publish(pid.home);
    await d.pages.publish(pid.projects);

    // Rechtstexte stammen nicht aus dem Design: als Entwürfe ohne Text anlegen, nie veröffentlichen.
    for (const [key, label, slug] of [
      ['imprint', s.legal.imprint, locale === 'de' ? 'impressum' : 'imprint'],
      ['privacy', s.legal.privacy, locale === 'de' ? 'datenschutz' : 'privacy'],
    ] as const) {
      await d.pages.create(d.actorId, {
        id: pid[key],
        locale,
        systemKey: null,
        translationGroupId: groups[key],
        slug,
        title: label,
        seoTitle: null,
        seoDescription: null,
        ogMediaId: null,
        content: [{ id: randomUUID(), type: 'page_title', title: label, showCount: false }],
      });
    }

    // ── Leistungen, Navigation, Einstellungen ─────────────────────
    for (const [i, sv] of SERVICES[locale].entries()) {
      await site.insertService({
        locale,
        key: sv.key,
        name: sv.name,
        description: sv.description,
        sortOrder: i,
        status: 'published',
      });
    }
    const nav = [
      { label: s.nav.work, pageId: pid.projects, fragment: null },
      { label: s.nav.services, pageId: pid.home, fragment: 'leistungen' },
      { label: s.nav.studio, pageId: pid.home, fragment: 'praeambel' },
    ];
    for (const location of ['header', 'footer'] as const) {
      for (const [i, n] of nav.entries()) {
        await site.insertNavigationItem({
          locale,
          location,
          label: n.label,
          pageId: n.pageId,
          fragment: n.fragment,
          sortOrder: i,
          status: 'published',
        });
      }
    }
    // Rechtliches zeigt auf die (noch nicht veröffentlichten) Seiten und erscheint erst mit deren Veröffentlichung.
    await site.insertNavigationItem({
      locale,
      location: 'legal',
      label: s.legal.imprint,
      pageId: pid.imprint,
      sortOrder: 0,
      status: 'published',
    });
    await site.insertNavigationItem({
      locale,
      location: 'legal',
      label: s.legal.privacy,
      pageId: pid.privacy,
      sortOrder: 1,
      status: 'published',
    });

    await site.upsertSetting('site.identity', locale, {
      name: 'serend.design',
      city: s.city,
      email: 'hallo@serend.design',
    });
    await site.upsertSetting('site.cta', locale, {
      label: s.cta,
      target: { kind: 'page', pageId: pid.home, fragment: 'kontakt' },
    });
    await site.upsertSetting('site.footer', locale, {
      madeWith: s.madeWith,
      copyright: '© 2026 serend.design®',
    });
    await site.upsertSetting('seo.defaults', locale, {
      siteName: 'serend.design',
      description: stripEmphasis(s.hero.intro),
    });
    await site.upsertSetting('organization', locale, { legalName: 'serend.design®' });
  }
}
