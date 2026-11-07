import { useQuery } from '@tanstack/react-query';
import type { CodeStatusResponse } from '@serend/schema';
import { api } from '../api';
import { Notice, errText, fmtDate, useAction } from '../ui';

/** Eine Anfrage, die so lange unbeantwortet bleibt, deutet auf einen nicht eingerichteten Deploy-Dienst hin. */
const PICKUP_WARN_MS = 30_000;
const RECENT_SUCCESS_MS = 15 * 60 * 1000;

/**
 * Hinweis auf neuen Code in origin/main und Button zum Deployen (git pull + Build + Neustart der Dienste auf dem Server).
 * Nur für Administratoren sichtbar: Das Deployment ändert die laufende Software, nicht die Inhalte.
 */
export function CodeUpdateCard() {
  const keys = [['code']];
  const q = useQuery({
    queryKey: ['code'],
    queryFn: () => api.get<CodeStatusResponse>('/code'),
    refetchInterval: (query) => {
      const s = query.state.data?.deploy.state;
      return s === 'running' || s === 'requested' ? 2000 : 15000;
    },
    // Beim Neustart der API antwortet sie kurz nicht: den letzten Stand weiter zeigen und still erneut versuchen
    retry: true,
    retryDelay: 2000,
  });
  const check = useAction(() => api.post<CodeStatusResponse>('/code/check'), keys);
  const deploy = useAction(() => api.post('/code/deploy'), keys);
  const s = q.data;

  if (!s) return q.error ? <Notice>{errText(q.error)}</Notice> : null;

  const d = s.deploy;
  const busy = d.state === 'running' || d.state === 'requested';
  const waitedMs = d.requestedAt ? Date.now() - +new Date(d.requestedAt) : 0;
  const recentSuccess =
    d.state === 'success' &&
    !!d.finishedAt &&
    Date.now() - +new Date(d.finishedAt) < RECENT_SUCCESS_MS;
  const error = check.error ?? deploy.error;

  const start = () => {
    const what =
      s.behind > 0
        ? `${s.behind} neue Änderung${s.behind === 1 ? '' : 'en'} von ${s.branch} holen`
        : `${s.branch} neu deployen`;
    const ok = confirm(
      `${what} und deployen?\n\nDer Server holt den Code per git pull, baut ihn und startet API, Worker und Vorschau neu. ` +
        'Danach baut die öffentliche Seite neu. Das dauert einige Minuten; die Seite bleibt währenddessen erreichbar, ' +
        'das Admin kann kurz nicht antworten.',
    );
    if (ok) deploy.mutate(undefined);
  };

  return (
    <section className="card code-update" aria-label="Code-Stand">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Software-Stand</h3>
        <button
          className="btn small"
          onClick={() => check.mutate(undefined)}
          disabled={check.isPending || busy}
        >
          {check.isPending ? 'Prüft …' : 'Jetzt prüfen'}
        </button>
      </div>

      {error && <Notice>{errText(error)}</Notice>}

      {busy ? (
        <>
          <p>
            <strong>
              {d.state === 'running' ? 'Deployment läuft …' : 'Deployment angefordert …'}
            </strong>{' '}
            <span className="muted">
              {d.state === 'running'
                ? `seit ${fmtDate(d.startedAt)}. Das Admin startet zwischendurch neu und ist kurz nicht erreichbar.`
                : 'wartet auf den Deploy-Dienst des Servers.'}
            </span>
          </p>
          {d.state === 'requested' && waitedMs > PICKUP_WARN_MS && (
            <Notice>
              Der Deploy-Dienst hat die Anfrage noch nicht übernommen. Ist{' '}
              <code>serend-deploy.path</code> auf dem Server eingerichtet? (docs/02-deployment.md,
              „Deployment aus dem Admin“)
            </Notice>
          )}
          {d.logTail && <pre className="log">{d.logTail}</pre>}
        </>
      ) : (
        <>
          {d.state === 'failed' && (
            <>
              <Notice>
                Das letzte Deployment ist fehlgeschlagen
                {d.finishedAt ? ` (${fmtDate(d.finishedAt)})` : ''}. Die Seite läuft weiter mit dem
                aktiven Release.
              </Notice>
              {d.logTail && <pre className="log">{d.logTail}</pre>}
            </>
          )}
          {recentSuccess && (
            <Notice kind="ok">
              Deployment abgeschlossen ({fmtDate(d.finishedAt)}, Stand {d.sha ?? s.localSha}). Der
              Seiten-Build läuft jetzt; Status unten.
            </Notice>
          )}
          {s.checkError && <Notice>{s.checkError}</Notice>}
          {s.behind > 0 && (
            <>
              <p>
                <strong>
                  {s.behind} neue Änderung{s.behind === 1 ? '' : 'en'} auf {s.branch}
                </strong>
                , die auf dem Server noch nicht laufen{' '}
                <span className="muted">
                  ({s.localSha ?? '?'} → {s.remoteSha ?? '?'})
                </span>
                .
              </p>
              <ul className="commits">
                {s.commits.map((c) => (
                  <li key={c.sha}>
                    <code>{c.sha}</code> {c.subject}{' '}
                    <span className="muted">· {fmtDate(c.date)}</span>
                  </li>
                ))}
                {s.behind > s.commits.length && (
                  <li className="muted">… und {s.behind - s.commits.length} weitere</li>
                )}
              </ul>
            </>
          )}
          {s.behind === 0 && s.checkedAt && !s.checkError && (
            <p className="muted">
              Der Server ist auf dem Stand von {s.branch} (<code>{s.localSha}</code>). Zuletzt
              geprüft {fmtDate(s.checkedAt)}.
            </p>
          )}
          {!s.checkedAt && !s.checkError && <p className="muted">Prüfe origin/{s.branch} …</p>}
          <div className="row">
            <button
              className={`btn ${s.behind > 0 ? 'primary' : ''}`}
              onClick={start}
              disabled={deploy.isPending}
            >
              {s.behind > 0 ? 'Jetzt deployen (git pull)' : 'Trotzdem neu deployen'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
