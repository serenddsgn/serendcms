import type { Locale } from '@serend/schema';
import type { UiStrings } from '../i18n';
import { ArrowIcon } from './Common';

export interface NavLink {
  label: string;
  href: string;
}

interface Props {
  locale: Locale;
  ui: UiStrings;
  nav: NavLink[];
  currentPath: string;
  home: string;
  switchTo: Record<Locale, string>;
  cta: NavLink;
}

export function Header({ locale, ui, nav, currentPath, home, switchTo, cta }: Props) {
  const current = (href: string) =>
    href.split('#')[0] === currentPath && !href.includes('#') ? 'page' : undefined;
  return (
    <header class="nav">
      <div class="wrap">
        <a href={home} class="mark" aria-label="serend.design">
          serend.design<sup>®</sup>
        </a>
        <nav class="mainnav" aria-label={ui.navLabel}>
          {nav.map((n) => (
            <a class="nl" href={n.href} aria-current={current(n.href)}>
              {n.label}
            </a>
          ))}
        </nav>
        <div class="tools">
          <div class="lang" role="group" aria-label={ui.langLabel} data-active={locale}>
            <span class="thumb" />
            {(['de', 'en'] as const).map((l) => (
              <a
                href={switchTo[l]}
                lang={l}
                hreflang={l}
                data-lang={l}
                aria-label={l === 'de' ? 'Deutsch' : 'English'}
                aria-current={l === locale ? 'true' : undefined}
              >
                {l.toUpperCase()}
              </a>
            ))}
          </div>
          <button
            class="iconbtn"
            type="button"
            data-theme-toggle
            data-label-on={ui.lightOn}
            data-label-off={ui.lightOff}
            aria-label={ui.lightOn}
            title={ui.lightOn}
          >
            <svg
              class="tg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z" fill="currentColor" />
            </svg>
          </button>
          <a
            class="cta"
            href={cta.href}
            aria-label={cta.label}
            data-inquiry-open
            aria-haspopup="dialog"
            aria-controls="inquiry"
          >
            <span class="dot" />
            <span class="lbl">{cta.label}</span>
          </a>
          <button
            class="iconbtn menubtn"
            type="button"
            data-menu-open
            aria-label={ui.menu}
            aria-controls="menu"
            aria-expanded="false"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      </div>
      <div class="menu" id="menu" data-open="false">
        <button class="iconbtn menuclose" type="button" data-menu-close aria-label={ui.closeMenu}>
          <ArrowIcon size={14} />
        </button>
        {nav.map((n) => (
          <a href={n.href}>{n.label}</a>
        ))}
      </div>
    </header>
  );
}
