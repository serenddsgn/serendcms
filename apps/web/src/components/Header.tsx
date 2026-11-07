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
        <div class="brand">
          <a href={home} class="mark" aria-label="serend.design">
            <svg
              class="logo"
              viewBox="0 0 841.9 463.5"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M0.8,0v463.5h840.4V0H0.8z M555.2,353.1c0,7.1-5.8,12.9-12.9,12.9h-53.7c-3.4,0-6.7-1.4-9.1-3.8l-49.3-49.3c-5-5-13.2-5-18.3,0l-49.3,49.3c-2.4,2.4-5.7,3.8-9.1,3.8h-53.7c-7.1,0-12.9-5.8-12.9-12.9v-53.7c0-3.4,1.4-6.7,3.8-9.1L340,241c5-5,5-13.2,0-18.3l-49.3-49.3c-2.4-2.4-3.8-5.7-3.8-9.1v-53.7c0-7.1,5.8-12.9,12.9-12.9h53.7c3.4,0,6.7,1.4,9.1,3.8l58.5,58.5l72,72l58.5,58.5c2.4,2.4,3.8,5.7,3.8,9.1v53.5H555.2z M555.2,192.1c0,11.5-13.9,17.3-22,9.1l-81.6-81.6c-8.1-8.1-2.4-22,9.1-22h81.6c7.1,0,12.9,5.8,12.9,12.9V192.1z"
              />
            </svg>
          </a>
          <span
            class="loc"
            data-location
            data-text-a={ui.locationAlt}
            data-text-b={ui.location}
            aria-label={ui.locationLabel}
          >
            <span class="loc-text" data-location-text aria-live="polite">
              {ui.location}
            </span>
          </span>
        </div>
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
          <a class="cta" href={cta.href} aria-label={cta.label}>
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
