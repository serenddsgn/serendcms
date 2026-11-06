# Auftrag an Cursor: Design für serend.design umsetzen

Kopiere den Block unten in Cursor. Hänge die Anweisungen zu Technik und Backend dahinter oder darunter.

---

Du baust die neue Website von **serend.design**, einem Designstudio aus Wuppertal mit Fokus auf UX/UI und Userführung. In diesem Ordner liegt das **finale Design**. Setze es pixelgenau und mit allen Interaktionen in React um. Technik und Backend beschreibe ich separat; hier geht es nur darum, das Design exakt zu treffen.

**Lies zuerst, in dieser Reihenfolge:**
1. `DESIGN-SPEC.md`: alle Regeln zu Layout, Komponenten, Animationen, Hell/Dunkel, DE/EN, Barrierefreiheit.
2. `tokens.css`: übernimm diese Werte 1:1 als CSS-Variablen bzw. Tailwind-Theme. Keine eigenen Farben oder Schriften erfinden.
3. `prototype/*.html`: der verbindliche Klick-Prototyp. Öffne die Dateien im Browser und vergleiche laufend. Jede Seite enthält im `<script>` das Wörterbuch `T` mit allen deutschen und englischen Texten; übernimm sie wörtlich.
4. `screenshots/`: Referenz für jede Seite in Dunkel/Hell, Deutsch/Englisch, Desktop (1440 px) und Phone (390 px).
5. `images/`: echte Demobilder. Verwende ausschließlich diese, nie Platzhalter oder Stockfotos.

**Seiten:**
- Startseite: `start.html`
- Projektübersicht: `projekte.html`
- Projektdetail: `detail.html`, als Vorlage für alle Projekte

**Muss:**
- Seitenübergang mit Fünf-Streifen-Vorhang, Masken-Reveal der Überschriften, Reveal beim Scrollen, Scroll-Fortschritt im Liquid-Gradient. Empfehlung: Framer Motion und Lenis für weiches Scrollen.
- Der **Liquid-Gradient** ist das einzige Markenzeichen. Er darf nur auf Schlüsselwörtern, dünnen Linien und Hover-Füllungen erscheinen, nie als Flächenhintergrund.
- Hell/Dunkel: startet nach Systemeinstellung, Umschalter im Header, gespeichert, ohne Aufblitzen beim Laden.
- DE/EN mit Routen `/de` und `/en`, Umschalter im Header, korrektes `lang` und `hreflang`.
- Filter und Raster/Liste auf der Projektseite, sticky Kapitel-Navigation und der interaktive Pick&Mix-Konfigurator auf der Detailseite, genau wie im Prototyp.
- Responsive bis 390 px, Touch-Ziele mindestens 44 px, Tastaturbedienung, sichtbarer Fokus, `prefers-reduced-motion`.

**Nicht:**
- Keine generischen UI-Kits-Looks, keine Verlaufsflächen, Glows, Emojis oder gefüllten Icon-Sets.
- Keine erfundenen Texte, Zahlen, Logos oder Testimonials.
- Keine Abweichungen bei Abständen, Schriftgrößen oder Kurven ohne Rückfrage.

**Abnahme:** Lege für jede Seite einen Screenshot neben die Referenz in `screenshots/`, je Modus und Sprache, und gleiche Abweichungen aus, bevor du weitermachst.
