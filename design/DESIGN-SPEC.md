# serend.design · Design-Spezifikation (Website-Relaunch)

Diese Datei beschreibt **nur das Design**: Aussehen, Verhalten, Animationen, Hell/Dunkel, Mehrsprachigkeit. Technik, Backend und Inhaltspflege kommen in einer eigenen Anweisung.

**Verbindlich sind, in dieser Reihenfolge:**
1. `prototype/` – lauffähiger Klick-Prototyp der drei Seiten. Bei Widersprüchen gilt der Prototyp.
2. `screenshots/` – ganzseitige Referenzbilder, Desktop 1440 px und Phone 390 px.
3. `tokens.css` – alle Farben, Schriften, Abstände, Radien und Bewegungskurven.
4. Diese Datei.

Den Prototyp öffnest du mit `prototype/start.html` im Browser. Alles ist klickbar: Filter, Ansichten, Konfigurator, Sprache und Thema. URL-Parameter für feste Zustände: `?theme=dark|light&language=de|en`.

---

## 1. Haltung: „Ruhe mit Führung“

serend.design ist ein Designstudio aus Wuppertal mit Fokus auf UX/UI und Userführung. Die Seite muss das vorleben:

- **Ruhig:** viel Weißraum, wenige Farben, große Typografie, Bilder tragen die Farbe.
- **Führend:** jede Seite hat eine klare nächste Aktion. Filter zeigen Zahlen, Kapitel zeigen Fortschritt, der Konfigurator zeigt, was noch fehlt.
- **Lebendig, aber leise:** Bewegung erklärt Zustände (öffnen, wechseln, füllen). Sie ist nie Selbstzweck.
- **Ein Markenzeichen:** der fließende **Liquid-Gradient** (Orchidee → Altrosa → Schieferblau → Pfirsich). Er erscheint nur in Schlüsselwörtern, der Fortschrittsleiste, dünnen Linien und Hover-Füllungen, **niemals als Flächen-Hintergrund**.

### Verboten (kein „KI-Look“)
- Keine Verlaufs-Hintergründe, Glows, Glasmorphism-Karten, Neon, Partikel.
- Keine Emojis, keine generischen Icon-Sets mit Füllung. Icons sind dünne Strich-SVGs (1.6 px), siehe Prototyp.
- Keine Karten mit farbigem Seitenrand, keine Schatten-Orgien. Schatten nur beim Hover-Preview und Segment-Thumb.
- Keine erfundenen Kennzahlen, Testimonials oder Logos.
- Keine Lorem-ipsum-Texte. Alle Texte stehen im Prototyp, in DE und EN.
- Kein Bounce, kein Wackeln, keine Autoplay-Karussells.

---

## 2. Design-Tokens

Alle Werte stehen in `tokens.css` und werden als CSS-Variablen (oder Tailwind-Theme) übernommen.

| Rolle | Dunkel | Hell |
|---|---|---|
| Hintergrund `--bg` | `#0a0a0a` | `#f6f5f2` |
| Text `--fg` | `#f5f5f4` | `#111111` |
| Sekundär `--mute` | `#a3a3a3` | `#57534e` |
| Linien `--line` | `rgba(255,255,255,.10)` | `rgba(0,0,0,.10)` |
| Karte `--card` | `#141414` | `#ffffff` |
| Immer-dunkle Fläche `--panel` | `#151515` + Kante | `#0c0c0d` |
| Status-Punkt | `#1aa179` | `#1aa179` |

**Schriften**
- **Display:** Plus Jakarta Sans 700/800, Laufweite −0.035em, auf großen Titeln −0.055em, Zeilenhöhe 0.86–1.0.
- **Text/UI:** Inter 400/500/600.
- **Labels:** Geist Mono 500, 11 px, Versalien, Laufweite .08em, Farbe `--mute`.
- **Platzhalter:** Die Hausschrift „CPE“ der aktuellen Seite ist hier durch Plus Jakarta Sans ersetzt. Liegt die Lizenz als Webfont vor, ersetzt sie `--font-display`.

**Raster:** Container 1360 px, Seitenränder 40 px (Phone 16 px). Viele Abschnitte nutzen eine **Label-Spalte von 200 px links** und den Inhalt rechts. Unter 820/900 px stapeln sie sich.

**Radien:** Kachel 14, Karte 16, Sektion 20, Panel 28, Pill 999.

**Bewegung:**
- Standard-Kurve: `cubic-bezier(.16,1,.3,1)`.
- Linien und Theme: `(.65,0,.35,1)`.
- Vorhang: `(.77,0,.18,1)`.
- Kleine Pop-Elemente: `(.34,1.56,.64,1)`.

---

## 3. Globale Bausteine

### 3.1 Header (sticky)
- 80 px hoch, Hintergrund `--bg` bei 78 % mit `backdrop-filter: blur(14px)`, untere Linie `--line`.
- **Links:** Wortmarke `serend.design®`, Plus Jakarta 700, 18 px.
- **Mitte:** `Arbeiten · Leistungen · Studio` (EN: `Work · Services · Studio`), 14 px, Abstand 36 px.
  - Hover: 1-px-Unterstreichung wächst von links (`scaleX`, 0.5 s).
  - Aktive Seite: Unterstreichung bleibt stehen, dazu `aria-current="page"`.
- **Rechts**, in dieser Reihenfolge, je 44 px hoch:
  1. **Sprachumschalter** DE | EN: Segment-Pill mit gleitendem Thumb (0.45 s, leichter Überschwinger). Mono 11 px.
  2. **Thema-Knopf:** runder Ring-Button mit Halbmond-Kreis-Icon. Das Icon dreht sich beim Wechsel um 180°.
  3. **CTA „Projekt anfragen“ / „Start a project“:** Pill in `--fg` auf `--bg` (kehrt sich mit dem Thema um), davor ein grüner, pulsierender Punkt (4 s, Ring 0 → 6 px). Hover: Liquid-Verlauf schiebt sich von unten in den Button (0.5 s), Text wird weiß.
- **Phone:** Mittelnavigation ausblenden (Menü-Overlay nach eigenem Ermessen, ruhig, Vollbild, gleiche Kurven). CTA nur als Punkt-Button mit `aria-label`.

### 3.2 Seitenübergang (Vorhang)
- Beim Betreten jeder Seite: fünf vertikale Streifen in `--curtain` (Gegenfarbe zum Thema) fahren gestaffelt nach oben weg. Dauer 0.9 s, Versatz 50 ms pro Streifen.
- Beim Verlassen läuft dieselbe Animation umgekehrt, dann Routenwechsel. Umsetzung mit Framer Motion `AnimatePresence` oder View Transitions API.
- Danach erscheinen Überschriften per **Masken-Reveal**: jede Zeile bzw. jedes Wort gleitet aus `translateY(105%)` in einem `overflow:hidden`-Container hoch. 1 s, gestaffelt um 0.06–0.1 s.
- Sekundärtext blendet mit `opacity 0 → 1, y 16 → 0` nach (`.fade`).

### 3.3 Scroll-Fortschritt
3 px Leiste ganz oben, fixiert, gefüllt mit dem Liquid-Gradient, `scaleX` an den Scroll-Fortschritt gekoppelt (`animation-timeline: scroll()` oder JS-Fallback).

### 3.4 Reveal beim Scrollen
Abschnitte und Kacheln blenden beim Eintreten in den Viewport ein: `opacity 0 → 1`, `y 24 → 0`, über die ersten ca. 20 % ihres Eintritts. Kein Wiederholen beim Hochscrollen.

### 3.5 Liquid-Text
Komponente `<LiquidText>`: Hintergrund `--liquid` mit `background-clip:text`, Größe 220 %, Position animiert über 16 s, alternierend (siehe `tokens.css`).
- Einsatz nur für Schlüsselwörter: „Oberflächen/surfaces“, „serend“, „Gebäcktheke/pastry counter“, die zweite Zeile im Zitat, die E-Mail-Adresse.
- Optional als WebGL-Shader nachbauen; die heutige Seite nutzt einen Canvas. Die CSS-Version ist die Mindestanforderung.

### 3.6 Weitere kleine Bausteine
- **BigLink:** Text plus 64-px-Ring mit Pfeil. Hover: Ring füllt sich mit `--fg`, Pfeil dreht −45°.
- **Mono-Label (Eyebrow):** siehe Typo.
- **Status-Punkt:** 7 px, `#1aa179`, Puls-Animation.
- **Footer:** drei Spalten (Studio, Navigation, Rechtliches), darunter eine Mono-Zeile mit `© 2026 serend.design®` und „Gemacht mit Hingabe in Wuppertal“.

---

## 4. Seiten

### 4.1 Startseite (`screenshots/desktop/01-start-*`)
1. **Hero:** Label „Designstudio Wuppertal“ in der linken Spalte. Headline in drei Zeilen, „Oberflächen“ als Liquid-Text.
   - EN: zwei Zeilen „We don’t just design / to fill *surfaces*.“
   - Darunter rechts der Einleitungstext (max. 520 px) und ein BigLink „Was wir machen“.
2. **Ausgewählte Arbeiten:** Label-Zeile „Ausgewählte Arbeiten — 05 / 12“ und „2023 — 2026“.
   - Bento-Raster: 3 Spalten, Zeilenhöhe 330 px. Kachel 1 ist 2×2 breit/hoch, Kachel 2 ist 1×2, danach drei 1×1-Kacheln. Abstand 14 px.
   - Kachel-Hover: Bild skaliert auf 1.045 (1.2 s). Unten gleitet eine Bildunterschrift (Name + Kategorie) auf einem Schwarz-Verlauf ein. In der Mitte poppt ein 96-px-Kreis in der **Projektfarbe** mit „Ansehen“ auf.
   - Rechts darunter: BigLink „Alle Projekte ansehen“.
3. **Leistungen:** H2 „Eine Website soll arbeiten. Also bauen wir sie so.“ Darunter vier Zeilen (Nummer · Name · Beschreibung · Pfeil).
   - Hover: Eine 2-px-Liquid-Linie läuft oben über die Zeile (0.8 s), der Name rückt 8 px nach rechts, der Pfeil dreht −45°.
4. **Präambel:** Karte (`--card`, Radius 20) mit dem **Studio-Porträt** links (16:10, Radius 16).
   - Das Bild zoomt beim Scrollen von 1.14 auf 1.0 heraus. Unten links ein Glas-Badge „Im Studio, Wuppertal“ mit Status-Punkt.
   - Rechts: Label „Präambel“, H2 „Warum *serend*?“, Präambel-Text, BigLink „Unsere Design-Philosophie“.
5. **Kontakt:** riesige Zeile „Großartiges / *erstellen.*“ (zweite Zeile kursiv in `--mute`), darunter `hallo@serend.design` als Liquid-Text.
6. **Footer.**

### 4.2 Projekte (`screenshots/desktop/02-projekte-*`)
1. **Titel:** „Arbeiten“ / „Work“ in `--fs-page-title`, hochgestellt die Anzahl „(12)“ in Mono. Rechts der Einleitungstext.
2. **Sticky Filterleiste** direkt unter dem Header (top 81 px, Blur, Linien oben und unten):
   - **Links Filter-Tabs:** Alle, Webdesign, E-Commerce, Branding, Druckbares (EN: All, Web design, E-commerce, Branding, Print). Jeweils mit hochgestellter Anzahl. Aktiv: Text `--fg` und eine 2-px-Liquid-Linie darunter, die per `scaleX` einläuft.
   - **Rechts:** Zähler „12 / 12“ (`aria-live`) und ein Segment „Raster | Liste“ mit gleitendem Thumb.
3. **Rasteransicht:** 3 Spalten, Spaltenabstand 20 px, Zeilenabstand 56 px.
   - Seitenverhältnisse wechseln 4:5 / 1:1 / 4:5, die Spalten sind vertikal um 0 / 64 / 24 px versetzt (ruhiges Mauerwerk).
   - Unter jedem Bild: Name (Inter 600, 18 px) und Jahr (Mono).
   - Hover: Bild 1.04, Kategorie-Tag blendet oben links ein, Name rückt 6 px nach rechts.
   - Beim Filterwechsel blenden die Kacheln gestaffelt neu ein (50 ms pro Kachel).
4. **Listenansicht** (`02-projekte-*-listenansicht.png`): Kopfzeile Nr. / Kunde / Bereich / Jahr. Zeilen mit großem Namen (Plus Jakarta 700).
   - Hover: Ein Punkt in der Projektfarbe poppt vor dem Namen auf, der Name rückt 12 px nach rechts. Ein Vorschaubild (200×250, um 3° gedreht) springt rechts neben der Zeile auf.
5. **Phone:** zwei Spalten ab 900 px, eine ab 560 px. In der Liste nur Nr., Name und Pfeil, ohne Vorschau.

### 4.3 Projektdetail (`screenshots/desktop/03-detail-*`)
Beispiel: Dolce & Falcone. Alle Texte stehen im Prototyp.
1. **Hero:** Label „Case 01 / 12 · E-Commerce“ links, Titel in zwei Zeilen per Masken-Reveal.
   - Darunter links der Untertitel „Die digitale *Gebäcktheke*: ein Shop, der den Kaufmoment versteht.“
   - Rechts eine Meta-Tabelle (`<dl>`): Kunde, Bereich, Jahr, Live-Link.
2. **Bildstrecke:** horizontal scrollbar mit Scroll-Snap, Bildhöhe `min(62vh, 560px)`, Radius 16, fokussierbar (`tabindex=0`, `role=region`).
3. **Kapitel:** links eine sticky Kapitel-Navigation (01–04 plus „↳ Ausprobieren“) mit 2-px-Schiene, die sich per Scroll mit dem Liquid-Gradient füllt. Rechts die Artikel, max. 760 px: Mono-Label, Lead in `--fs-lead`, Fließtext 19/1.7 in `--body`.
4. **Zitat:** volle Breite zwischen zwei Linien. „Das Problem war nicht der Shop.“ und darunter „*Das Problem war die Box.*“ als Liquid-Text.
5. **Interaktive Demo (Pick&Mix-Konfigurator):** Panel in `--panel`, Radius 28, immer dunkel.
   - **Links:** Boxgröße 12/18/24/46 als Radio-Pills, dann vier Sorten mit −/Zahl/+ (44-px-Kreisbuttons, deaktiviert an den Grenzen).
   - **Rechts:** Raster aus Slots (6 Spalten, ab 46 Stück 8). Gefüllte Slots poppen in der Sortenfarbe ein. Darunter eine Liquid-Fortschrittsleiste, der Status „9 von 12 · noch 3 Stücke“ (`aria-live`), der Preis groß, und ein Button, der erst bei voller Box aktiv wird („In den Warenkorb“).
   - Verkleinern der Box entfernt überzählige Stücke von hinten.
   - Sorten und Preise sind **Beispiele** und so gekennzeichnet.
6. **Nächstes Projekt:** volle Breite in `--panel`, riesiger Name mit Pfeil. Hover: Der Name rückt 18 px nach rechts, rechts springt ein um 4° gedrehtes Vorschaubild auf.

---

## 5. Hell / Dunkel
- **Start:** Systemeinstellung (`prefers-color-scheme`). Dunkel ist Marken-Default.
- **Umschalten:** Knopf im Header. Die Wahl in `localStorage` speichern und vor dem ersten Paint per Inline-Script auf `<html>` setzen (kein Aufblitzen).
- **Übergang:** Hintergrund und Text wechseln in 0.6 s mit `(.65,0,.35,1)`. Der Vorhang nutzt immer die Gegenfarbe.
- **Immer dunkel:** Konfigurator-Panel und „Nächstes Projekt“. Im Dunkelmodus heben sie sich durch `#151515` plus eine feine Kante ab.
- **Liquid-Gradient:** gleich in beiden Modi.

## 6. Mehrsprachigkeit (DE / EN)
- **Routen:** `/de/…` und `/en/…`, z. B. `/de/projekte/dolce-falcone` und `/en/work/dolce-falcone`. Erste Auswahl nach `Accept-Language`, danach Cookie.
- **Umschalter:** bleibt auf derselben Seite und wechselt nur die Sprache. Inhalt baut sich mit den Reveal-Animationen neu auf (wie ein kleiner Seitenübergang).
- **Markup:** `<html lang>` korrekt, `hreflang`-Links für SEO.
- **Texte:** Alle UI-Texte stehen als Wörterbuch `T = { de: {…}, en: {…} }` im `<script>` der Prototyp-Seiten. Bitte 1:1 übernehmen, inklusive `aria-label`s und Bild-Alt-Texten.
- **Formate:** Zahlen und Preise lokalisiert: DE `16,60 €`, EN `€16.60`.
- **Längenunterschiede:** Die EN-Headline der Startseite hat zwei statt drei Zeilen. Layouts müssen unterschiedliche Längen vertragen.

## 7. Barrierefreiheit (Pflicht)
- Kontrast mindestens 4.5:1 für Text, auch für Mono-Labels.
- Alles per Tastatur erreichbar.
- Sichtbarer Fokusring: 2 px `--focus`, Offset 2–3 px.
- Echte `<button>`, `<a>`, `<dl>`, `<nav aria-label>`. Gruppen mit `role="group"`/`radiogroup` und `aria-pressed`/`aria-checked`.
- Live-Regionen für Zähler (Filter, Konfigurator).
- Touch-Ziele mindestens 44 px.
- `prefers-reduced-motion`: alle Animationen aus, Inhalte sofort sichtbar.

## 8. Daten pro Projekt (für das Backend, nur was das Design braucht)
`slug`, `name`, `year`, `categories[]` (web | shop | brand | print), `color`, `cover`, `hero`, `gallery[]`, und je Sprache: `subtitle`, `chapters[]` (Label, Lead, Text), `quote`, `liveUrl`, `nextProject`.

- **Projektfarbe** (`color`) steuert: Hover-Kreis der Kachel, Punkt in der Liste, Hintergrund beim Laden des Bildes.
- **Interaktive Demo:** optional pro Projekt (Komponente frei wählbar).

## 9. Inhalte dieses Pakets
```
DESIGN-SPEC.md        diese Datei
CURSOR-PROMPT.md      kurzer Auftrag zum Einfügen in Cursor
tokens.css            Design-Tokens
prototype/            klickbarer Referenz-Prototyp (start.html, projekte.html, detail.html)
screenshots/desktop/  1440 px, je Seite: dark/light × de/en (+ Listenansicht)
screenshots/mobile/   390 px, je Seite: dark-de und light-en
images/               echte Demobilder (siehe images/README.md)
```
