import type { Locale } from '@serend/schema';
import type { UiStrings } from '../i18n';

interface Props {
  ui: UiStrings;
  locale: Locale;
  email: string;
  /** Link zur Datenschutzerklärung (öffnet in neuem Tab, damit nichts vom Entwurf verloren geht). */
  privacyHref?: string | undefined;
}

/**
 * Vollbild-Dialog „Projekt anfragen“. Bewusst außerhalb des Headers gerendert (dessen backdrop-filter würde
 * `position: fixed` einfangen). Öffnen/Schließen und Absenden übernimmt scripts/site.ts; ohne JS bleibt der
 * Header-Button ein normaler Link zum Kontaktbereich.
 */
export function InquiryModal({ ui, locale, email, privacyHref }: Props) {
  const q = ui.inquiry;
  const d = (n: number) => `--d:${(0.32 + n * 0.07).toFixed(2)}s`;
  return (
    <dialog
      class="inquiry"
      id="inquiry"
      data-state="closed"
      aria-labelledby="iq-title"
      data-locale={locale}
      data-ref-label={ui.follow.reference}
    >
      <div class="wrap iq-inner">
        <div class="iq-bar iq-a" style={d(0)}>
          <span class="mark">
            serend.design<sup>®</sup>
          </span>
          <button class="iconbtn" type="button" data-inquiry-close aria-label={q.close}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              aria-hidden="true"
            >
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        <div class="iq-grid">
          <div class="iq-lead">
            <p class="eyebrow iq-a" style={d(1)}>
              {q.eyebrow}
            </p>
            <h2 class="display iq-a" id="iq-title" style={d(2)}>
              {q.line1}
              <br />
              <span>{q.line2}</span>
            </h2>
            <p class="iq-intro iq-a" style={d(3)}>
              {q.intro}
            </p>
            <a class="display liquid iq-mail iq-a" href={`mailto:${email}`} style={d(4)}>
              {email}
            </a>
          </div>
          <div class="iq-side">
            <form
              class="iq-form"
              data-inquiry-form
              data-sending={q.sending}
              data-error={q.errorGeneric}
              data-error-rate={q.errorRate}
            >
              <label class="iq-field iq-a" style={d(2)}>
                <span class="eyebrow">{q.name}</span>
                <input name="name" type="text" required maxlength={100} autocomplete="name" />
              </label>
              <label class="iq-field iq-a" style={d(3)}>
                <span class="eyebrow">{q.email}</span>
                <input name="email" type="email" required maxlength={254} autocomplete="email" />
              </label>
              <label class="iq-field iq-a" style={d(4)}>
                <span class="eyebrow">{q.message}</span>
                <textarea
                  name="message"
                  required
                  rows={5}
                  maxlength={5000}
                  placeholder={q.messagePlaceholder}
                />
              </label>
              <input
                class="iq-hp"
                type="text"
                name="website"
                tabindex={-1}
                autocomplete="off"
                aria-hidden="true"
              />
              <label class="iq-consent iq-a" style={d(5)}>
                <input name="consent" type="checkbox" required />
                <span>
                  {q.consentBefore}
                  {privacyHref ? (
                    <a href={privacyHref} target="_blank" rel="noopener">
                      {q.consentLink}
                    </a>
                  ) : (
                    q.consentLink
                  )}
                  {q.consentAfter}
                </span>
              </label>
              <p class="iq-status" role="status" aria-live="polite" data-inquiry-status />
              <button class="iq-submit iq-a" type="submit" style={d(6)} data-inquiry-submit>
                <span class="dot" />
                <span class="lbl">{q.submit}</span>
              </button>
            </form>
            <div class="iq-done" data-inquiry-done hidden tabindex={-1}>
              <h3 class="display">{q.doneTitle}</h3>
              <p>{q.doneText}</p>
              <button class="iq-submit" type="button" data-inquiry-close>
                <span class="lbl">{q.doneClose}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
