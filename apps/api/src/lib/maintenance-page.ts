import { parseInlineMarkup, type Inline } from '@serend/schema';

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Überschrift: Text wird escaped, [[Schlüsselwort]] bekommt den Liquid-Verlauf (nie als Fläche). */
function headline(markup: string): string {
  const runs: Inline = parseInlineMarkup(markup);
  return runs
    .map((r) =>
      r.liquid
        ? `<span class="liquid">${esc(r.text)}</span>`
        : r.em
          ? `<em>${esc(r.text)}</em>`
          : esc(r.text),
    )
    .join('');
}

export interface MaintenancePageInput {
  headlineDe: string;
  headlineEn: string;
  hasLogo: boolean;
}

/**
 * Eigenständige Seite im Design (Tokens, Schriften, Liquid-Verlauf, Statuspunkt), ohne Skripte und ohne externe Quellen.
 * Caddy liefert sie mit Status 503 aus; Dateien liegen unter /maintenance-assets/.
 */
export function renderMaintenancePage({
  headlineDe,
  headlineEn,
  hasLogo,
}: MaintenancePageInput): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>serend.design</title>
<style>
@font-face{font-family:"Codec Pro";font-weight:800;font-display:swap;src:url("/maintenance-assets/fonts/codec-pro-extrabold.woff2") format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:200 800;font-display:swap;src:url("/maintenance-assets/fonts/plus-jakarta-sans-latin.woff2") format("woff2")}
@font-face{font-family:"Geist Mono";font-weight:400 500;font-display:swap;src:url("/maintenance-assets/fonts/geist-mono-latin.woff2") format("woff2")}
:root{--bg:#0a0a0a;--fg:#f5f5f4;--mute:#a3a3a3;--line:rgba(255,255,255,.1);color-scheme:dark}
@media (prefers-color-scheme:light){:root{--bg:#f6f5f2;--fg:#111;--mute:#57534e;--line:rgba(0,0,0,.1);color-scheme:light}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;grid-template-rows:auto 1fr auto;background:var(--bg);color:var(--fg);font-family:"Plus Jakarta Sans",system-ui,sans-serif}
header,footer{padding:28px 40px;display:flex;justify-content:space-between;align-items:center;gap:16px}
header{border-bottom:1px solid var(--line)} footer{border-top:1px solid var(--line)}
.mark{font-family:"Codec Pro","Plus Jakarta Sans",sans-serif;font-weight:700;font-size:18px}
.mark sup{font-size:10px} .logo{display:block;max-height:44px;max-width:240px;width:auto;height:auto}
.mono{font-family:"Geist Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:500;color:var(--mute)}
main{display:flex;flex-direction:column;justify-content:center;padding:64px 40px;max-width:1360px;width:100%;margin:0 auto}
.eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 28px}
.dot{width:7px;height:7px;border-radius:99px;background:#1aa179;animation:pulse 4s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(26,161,121,.55)}50%{box-shadow:0 0 0 6px rgba(26,161,121,0)}}
h1{margin:0;font-family:"Codec Pro","Plus Jakarta Sans",sans-serif;font-weight:800;line-height:.95;font-size:clamp(44px,8.4vw,128px);max-width:14ch}
h1 em{font-style:italic;color:var(--mute)}
.en{margin:32px 0 0;color:var(--mute);font-size:clamp(18px,2vw,26px)}
.en .liquid{color:inherit;background:none;-webkit-text-fill-color:currentColor;animation:none}
.liquid{background-image:radial-gradient(40% 80% at 15% 50%,#b06bb4 0,transparent 70%),radial-gradient(35% 90% at 85% 40%,#e0a98f 0,transparent 70%),radial-gradient(45% 90% at 50% 90%,#5d6b93 0,transparent 70%),linear-gradient(90deg,#703b58,#8d4557 50%,#4a3a5e);background-size:220% 220%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:liquid 16s ease-in-out infinite alternate}
@keyframes liquid{0%{background-position:0% 30%}33%{background-position:60% 80%}66%{background-position:100% 20%}100%{background-position:30% 60%}}
.rise{display:block;overflow:hidden;padding-bottom:.06em}.rise>span{display:inline-block;transform:translateY(105%);animation:up 1s cubic-bezier(.16,1,.3,1) .2s forwards}
@keyframes up{to{transform:none}}
@media (max-width:560px){header,footer{padding:20px 16px}main{padding:48px 16px}}
@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important}.rise>span{transform:none}}
</style>
</head>
<body>
<header>
${hasLogo ? '<img class="logo" src="/maintenance-assets/logo.webp" alt="serend.design">' : '<span class="mark">serend.design<sup>®</sup></span>'}
<span class="mono">Wuppertal</span>
</header>
<main>
<p class="eyebrow mono"><span class="dot"></span><span>Wartungsarbeiten</span></p>
<h1><span class="rise"><span>${headline(headlineDe)}</span></span></h1>
<p class="en" lang="en">${headline(headlineEn)}</p>
</main>
<footer><span class="mono">© 2026 serend.design®</span><span class="mono">Gemacht mit Hingabe in Wuppertal</span></footer>
</body>
</html>
`;
}
