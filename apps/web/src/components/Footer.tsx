import type { UiStrings } from '../i18n';
import type { NavLink } from './Header';

interface Props {
  ui: UiStrings;
  name: string;
  city: string;
  email: string;
  nav: NavLink[];
  legal: NavLink[];
  legalLabel: string;
  copyright: string;
  madeWith: string;
}

export function Footer({ name, city, email, nav, legal, legalLabel, copyright, madeWith }: Props) {
  return (
    <footer class="footer">
      <div class="wrap cols">
        <div>
          <p class="eyebrow">Studio</p>
          {name}®<br />
          {city}
          <br />
          <a href={`mailto:${email}`}>{email}</a>
        </div>
        <div>
          <p class="eyebrow">Navigation</p>
          {nav.map((n) => (
            <>
              <a href={n.href}>{n.label}</a>
              <br />
            </>
          ))}
        </div>
        <div>
          <p class="eyebrow">{legalLabel}</p>
          {legal.map((n) => (
            <>
              <a href={n.href}>{n.label}</a>
              <br />
            </>
          ))}
        </div>
      </div>
      <div class="wrap bottom eyebrow">
        <span>{copyright}</span>
        <span>{madeWith}</span>
      </div>
    </footer>
  );
}
