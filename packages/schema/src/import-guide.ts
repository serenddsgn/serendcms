import { IMPORT_FORMAT, IMPORT_VERSION } from './import.js';

/**
 * Beispiel für die Importdatei. Wird in der Anleitung für die KI mit ausgegeben und im Test gegen das Schema geprüft,
 * damit Anleitung und Format nicht auseinanderlaufen.
 */
export const IMPORT_EXAMPLE = {
  format: IMPORT_FORMAT,
  version: IMPORT_VERSION,
  items: [
    {
      kind: 'project',
      locale: 'de',
      group: 'beispiel-werkstatt',
      slug: 'beispiel-werkstatt',
      title: 'Beispiel Werkstatt',
      subtitle: 'Ein Werkstattbetrieb, der seine Termine nicht mehr per Telefon verwaltet.',
      year: 2026,
      categories: ['web', 'shop'],
      color: '#b62042',
      client: 'Beispiel Werkstatt GmbH',
      liveUrl: 'https://example.com',
      cover: 'beispiel-werkstatt-cover.jpg',
      seoTitle: 'Beispiel Werkstatt – Terminbuchung statt Telefonschleife',
      seoDescription:
        'Wie aus einer Werkstatt-Website ein Werkzeug wurde: Termine, Leistungen und Rückfragen laufen an einer Stelle zusammen.',
      content: [
        {
          type: 'chapter',
          title: 'Um wen es geht',
          lead: 'Die Beispiel Werkstatt repariert seit 1998 Fahrräder, Lastenräder und alles dazwischen.',
          body: [
            'Ein Betrieb mit Stammkundschaft, vollem Kalender und einem Telefon, das selten stillsteht.\n\nWer hier anruft, will keinen Katalog. Er will wissen: Wann ist mein Rad fertig?',
          ],
        },
        {
          type: 'image',
          media: 'beispiel-werkstatt-1.jpg',
          size: 'large',
          caption: 'Die Werkstatt in Elberfeld.',
        },
        {
          type: 'chapter',
          title: 'Die Aufgabe',
          lead: 'Die alte Website zeigte Adresse und Öffnungszeiten. Mehr nicht.',
          body: [
            'Das eigentliche Problem lag woanders: Jeder Termin war ein Anruf, jede Rückfrage eine Mail. Das kostet [[Zeit]], die in der Werkstatt fehlt.',
          ],
        },
        {
          type: 'quote',
          lines: ['Das ist keine Visitenkarte im Browser.', 'Es ist ein *Werkzeug*.'],
        },
        {
          type: 'chapter',
          title: 'Was wir gebaut haben',
          lead: 'Eine Terminbuchung, die weiß, wie lange eine Reparatur dauert.',
          body: [
            'Kundinnen und Kunden wählen die Leistung, die Werkstatt rechnet die Dauer aus und zeigt nur freie Zeiten. Rückfragen landen strukturiert im Postfach.',
          ],
        },
        {
          type: 'gallery',
          layout: 'grid',
          items: [
            { media: 'beispiel-werkstatt-2.jpg', caption: 'Terminauswahl auf dem Smartphone.' },
            { media: 'beispiel-werkstatt-3.jpg' },
          ],
        },
        {
          type: 'chapter',
          title: 'Was sich dadurch ändert',
          lead: 'Die Werkstatt arbeitet wieder an Rädern statt am Telefon.',
          body: [
            'Die Website ist nicht mehr der Anfang der Geschichte. Sie ist der erste Schritt im Auftrag.',
          ],
        },
      ],
    },
    {
      kind: 'project',
      locale: 'en',
      group: 'beispiel-werkstatt',
      slug: 'beispiel-werkstatt',
      title: 'Beispiel Werkstatt',
      subtitle: 'A workshop that no longer manages appointments by phone.',
      year: 2026,
      categories: ['web', 'shop'],
      color: '#b62042',
      client: 'Beispiel Werkstatt GmbH',
      cover: 'beispiel-werkstatt-cover.jpg',
      content: [
        {
          type: 'chapter',
          title: 'Who it’s about',
          lead: 'Beispiel Werkstatt has been repairing bikes, cargo bikes and everything in between since 1998.',
          body: ['A business with regulars, a full calendar and a phone that rarely rests.'],
        },
      ],
    },
    {
      kind: 'page',
      locale: 'de',
      slug: 'beispielseite',
      title: 'Beispielseite',
      seoTitle: 'Beispielseite | serend.design®',
      seoDescription: 'Eine Inhaltsseite mit Überschriften, Text, Liste und Bild.',
      content: [
        { type: 'page_title', title: 'Beispielseite', intro: 'Kurz, klar, ohne Nebelmaschine.' },
        { type: 'heading', level: 2, text: 'Wer wir sind' },
        {
          type: 'text',
          text: 'Wir bauen Websites, die mehr können als aussehen.\n\nDas klingt nach Werbung. Ist aber ein Arbeitsprinzip.',
        },
        { type: 'heading', level: 3, text: 'Was dazugehört' },
        {
          type: 'text',
          text: '- Webdesign\n- Eigene Funktionen\n- Branding, wenn die Marke es braucht',
        },
        { type: 'image', media: 'beispiel-werkstatt-1.jpg', size: 'medium' },
      ],
    },
  ],
} as const;

export interface GuideMedia {
  filename: string;
  altText?: string | undefined;
}

/**
 * Anleitung für eine KI, die Importdateien erzeugt. Enthält Format, Grenzen, Schreibstil und ein Beispiel.
 * Optional mit der aktuellen Medienliste, damit die KI nur vorhandene Dateinamen verwendet.
 */
export function buildImportGuide(media?: readonly GuideMedia[]): string {
  const mediaSection =
    media && media.length > 0
      ? `## Verfügbare Medien

Bilder und Videos dürfen **nur** mit einem dieser Dateinamen angesprochen werden. Gibt es kein passendes Medium, lass das Feld weg
oder den Block aus. Erfinde keine Dateinamen.

${media.map((m) => `- \`${m.filename}\`${m.altText ? ` – ${m.altText}` : ''}`).join('\n')}
`
      : `## Medien

Bilder werden über den **Dateinamen** aus der Medienbibliothek angesprochen. Die Dateien lädst du vorher im Admin unter „Medien“ hoch.
Nutze nur Dateinamen, die dir genannt wurden. Erfinde keine.
`;

  return `# serendCMS – Import-Anleitung für KI

Du erstellst Inhalte für die Website serend.design (Designstudio in Wuppertal) und lieferst sie als **eine JSON-Datei** im
Format \`${IMPORT_FORMAT}\`. Die Datei wird im Admin unter „Import“ hochgeladen. Daraus entstehen **Entwürfe**, nichts wird
automatisch veröffentlicht. Antworte ausschließlich mit dem JSON (gültig, ohne Kommentare, ohne Erklärtext drumherum).

## Aufbau der Datei

\`\`\`json
{ "format": "${IMPORT_FORMAT}", "version": ${IMPORT_VERSION}, "items": [ /* Einträge */ ] }
\`\`\`

Jeder Eintrag hat \`kind\`: \`"project"\` (Projekt/Case) oder \`"page"\` (Inhaltsseite wie Impressum oder Datenschutz).
Maximal 50 Einträge pro Datei.

### Felder, die jeder Eintrag hat

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| \`kind\` | ja | \`project\` oder \`page\` |
| \`locale\` | nein (Standard \`de\`) | \`de\` oder \`en\` |
| \`title\` | ja | Titel, höchstens 120 Zeichen |
| \`slug\` | nein | URL-Teil, nur Kleinbuchstaben, Ziffern, Bindestriche. Ohne Angabe wird er aus dem Titel gebildet |
| \`group\` | nein | Beliebiger Name. Zwei Einträge mit gleichem \`group\` (einer \`de\`, einer \`en\`) werden als Sprachversionen verknüpft |
| \`seoTitle\` | nein | höchstens 70 Zeichen |
| \`seoDescription\` | nein | höchstens 200 Zeichen |
| \`content\` | nein | Liste von Blöcken (siehe unten) |

### Zusätzliche Felder bei \`project\`

| Feld | Pflicht | Bedeutung |
| --- | --- | --- |
| \`year\` | ja | Jahr als Zahl |
| \`categories\` | ja | Eine oder mehrere von \`web\`, \`shop\`, \`brand\`, \`print\` (Webdesign, E-Commerce, Branding, Druckbares) |
| \`subtitle\` | nein | Ein Satz unter dem Titel, mit Inline-Schreibweise möglich |
| \`client\` | nein | Name des Kunden |
| \`liveUrl\` | nein | Vollständige \`https://\`-Adresse |
| \`color\` | nein | Markenfarbe als \`#rrggbb\` (Standard \`#303030\`) |
| \`cover\` | nein | Dateiname des Titelbilds |
| \`gallery\` | nein | Liste von Dateinamen: Bildstrecke direkt unter dem Titel |

## Inline-Schreibweise (in allen Textfeldern, die Formatierung erlauben)

- \`[[Schlüsselwort]]\` – Wort mit Farbverlauf (sparsam: höchstens ein bis zwei pro Abschnitt)
- \`*betont*\` – kursiv
- \`[Text](https://…)\` – Link (auch \`/seite/\` für interne Links)

Einfache Zeilenumbrüche bleiben erhalten, Leerzeilen trennen Absätze. Kein HTML, kein Markdown darüber hinaus.

## Blöcke in Projekten (\`content\`)

| \`type\` | Felder | Hinweise |
| --- | --- | --- |
| \`chapter\` | \`title\` (bis 60 Zeichen, erscheint in der Kapitel-Navigation), \`lead\` (hervorgehobener erster Absatz), \`body\` (Liste von Absätzen, höchstens 12) | Das Grundgerüst. Meist vier bis fünf Kapitel |
| \`quote\` | \`lines\` (1 bis 3 Zeilen) | Große Zitatzeile zwischen Kapiteln, wie eine Pointe |
| \`image\` | \`media\`, \`size\` (\`small\`, \`medium\`, \`large\`, \`full\`), \`caption\` (optional, bis 200 Zeichen) | \`small\`/\`medium\`/\`large\` stehen in der Textspalte, \`full\` über die ganze Seitenbreite |
| \`gallery\` | \`layout\` (\`strip\` = horizontaler Streifen, \`grid\` = zwei Spalten), \`items\` (Liste aus \`media\` und optional \`caption\`) | Mehrere Bilder zusammen. Bildunterschriften zeigt nur \`grid\` |

Interaktive Demos lassen sich nicht importieren, die baut ein Mensch im Admin.

## Blöcke auf Seiten (\`content\`)

| \`type\` | Felder | Hinweise |
| --- | --- | --- |
| \`page_title\` | \`title\`, \`intro\` (optional) | Meist der erste Block |
| \`heading\` | \`text\`, \`level\` (\`2\` oder \`3\`, Standard \`2\`) | Zwischenüberschrift |
| \`text\` | \`text\` | Fließtext. Leerzeilen trennen Absätze. Ein Absatz aus lauter Zeilen mit \`- \` wird eine Liste, mit \`1. \` eine nummerierte Liste |
| \`image\` | wie bei Projekten | |

${mediaSection}
## Schreibstil

Die Texte sollen klingen wie die bestehende Website: ein Studio, das genau hinschaut und trocken formuliert.

- **Konkret statt Prospekt.** Was wurde gebaut, für wen, warum nicht mit einer Standardlösung? Zahlen und Details nennen
  (Standorte, Mengen, Abläufe), nichts Erfundenes. Fehlt eine Information, lass sie weg oder frage nach.
- **Kurze Sätze, auch Fragmente.** „Nicht ein Katalog mit Warenkorb. Sondern der erste Schritt im Verkauf.“
  Gegenüberstellungen in der Form „Nicht X. Sondern Y.“ sind typisch, aber nicht in jedem Absatz.
- **Trockener Humor, höchstens ein Mal pro Abschnitt.** Etwa: „Das Internet ist noch nicht bei Telepathie angekommen.“
  Der Witz darf die Information nie verdecken.
- **Kein Marketingdeutsch.** Keine Wörter wie „innovativ“, „maßgeschneidert“, „ganzheitlich“, „Synergie“, „einzigartig“,
  „Lösungen“ als Füllwort. Keine Ausrufezeichen.
- **Ansprache.** In Projekttexten über den Kunden in der dritten Person und sachlich, „wir“ für das Studio. In Seiten, die Besucher direkt
  ansprechen (Datenschutz, Kontakt), „Sie“.
- **Überschriften sind Aussagen, keine Rubriken-Etiketten.** Jede Absatzfolge endet gern mit einer Zeile, die das Ergebnis
  auf den Punkt bringt.
- **Englisch ist keine Wort-für-Wort-Übersetzung.** Gleicher Ton, natürliche englische Sätze, gleiche Struktur.

### Aufbau einer Projektseite

Bewährte Kapitel, in dieser Reihenfolge (Titel dürfen angepasst werden, die Logik bleibt):

1. **Um wen es geht** (EN: *Who it’s about*) – Kunde in zwei, drei Sätzen. Was macht der Betrieb, was ist besonders?
2. **Die Aufgabe** (EN: *The task*) – Was war das eigentliche Problem? Warum reicht die Standardlösung nicht?
3. **Was wir gebaut haben** (EN: *What we built*) – Konkret: Funktionen, Abläufe, Entscheidungen. Hier darf es am längsten sein.
4. **Was sich dadurch ändert** (EN: *What changes as a result*) – Das Ergebnis für den Betrieb, am Ende gern eine Pointe-Zeile.

Dazwischen: ein bis zwei \`image\`-/\`gallery\`-Blöcke und höchstens ein \`quote\`.

## Prüfregeln (sonst wird der Eintrag abgelehnt)

- Alle Pflichtfelder vorhanden, Längen eingehalten, \`categories\` nur aus \`web\`, \`shop\`, \`brand\`, \`print\`.
- \`slug\` nur Kleinbuchstaben, Ziffern, Bindestriche; je Art und Sprache nur einmal.
- Bei \`group\` höchstens ein Eintrag je Sprache und nur Projekte mit Projekten bzw. Seiten mit Seiten.
- Unbekannte Medien-Dateinamen führen nicht zum Abbruch, das Bild wird ausgelassen und im Import gemeldet.

## Vollständiges Beispiel

\`\`\`json
${JSON.stringify(IMPORT_EXAMPLE, null, 2)}
\`\`\`
`;
}
