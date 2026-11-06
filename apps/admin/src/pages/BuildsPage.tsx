import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSession } from '../session';
import { Modal, Notice, Pill, errText, fmtDate, useAction } from '../ui';
import { CodeUpdateCard } from './CodeUpdateCard';

interface Build {
  id: string;
  status: string;
  trigger: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorSummary: string | null;
  releaseId: string | null;
}
interface Release {
  id: string;
  buildId: string;
  isActive: boolean;
  createdAt: string;
  activatedAt: string | null;
  removed: boolean;
}
interface Status {
  activeRelease: Release | null;
  lastBuild: Build | null;
  buildQueued: boolean;
  buildRunning: boolean;
  pending: { projects: number; pages: number };
}

export function BuildsPage() {
  const { user } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const poll = busy ? 2000 : 10000;
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<Status>('/status'),
    refetchInterval: poll,
  });
  const builds = useQuery({
    queryKey: ['builds'],
    queryFn: () => api.get<{ builds: Build[] }>('/builds'),
    refetchInterval: poll,
  });
  const releases = useQuery({
    queryKey: ['releases'],
    queryFn: () => api.get<{ releases: Release[] }>('/releases'),
    refetchInterval: 10000,
  });
  const keys = [['status'], ['builds'], ['releases']];
  const trigger = useAction(() => api.post('/builds'), keys);
  const rollback = useAction((id: string) => api.post(`/releases/${id}/activate`), keys);
  const s = status.data;
  const nowBusy = !!(s?.buildQueued || s?.buildRunning);
  if (nowBusy !== busy) setBusy(nowBusy);
  return (
    <>
      <div className="row between">
        <div>
          <h1>Veröffentlichung</h1>
          <p className="muted">Inhalte gehen mit einem neuen Build der öffentlichen Seite live.</p>
        </div>
        <button
          className="btn primary"
          onClick={() => trigger.mutate(undefined)}
          disabled={trigger.isPending || s?.buildRunning}
        >
          Seite jetzt neu bauen
        </button>
      </div>
      {user.role === 'admin' && <CodeUpdateCard />}
      {(status.error || trigger.error || rollback.error) && (
        <Notice>{errText(status.error ?? trigger.error ?? rollback.error)}</Notice>
      )}
      {s && (
        <div className="card">
          <div className="grid3">
            <div>
              <h3>Aktives Release</h3>
              {s.activeRelease ? (
                <>{fmtDate(s.activeRelease.activatedAt)}</>
              ) : (
                <span className="muted">noch keins</span>
              )}
            </div>
            <div>
              <h3>Build</h3>
              {s.buildRunning ? (
                <Pill value="running" />
              ) : s.buildQueued ? (
                <Pill value="queued" />
              ) : s.lastBuild ? (
                <Pill value={s.lastBuild.status} />
              ) : (
                '–'
              )}
            </div>
            <div>
              <h3>Offene Änderungen</h3>
              {s.pending.projects + s.pending.pages === 0 ? (
                <span className="muted">keine</span>
              ) : (
                `${s.pending.projects} Projekt(e), ${s.pending.pages} Seite(n) nicht veröffentlicht`
              )}
            </div>
          </div>
        </div>
      )}
      <h2>Builds</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Angefordert</th>
              <th>Auslöser</th>
              <th>Status</th>
              <th>Dauer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {builds.data?.builds.map((b) => (
              <tr key={b.id}>
                <td>{fmtDate(b.requestedAt)}</td>
                <td>{b.trigger}</td>
                <td>
                  <Pill value={b.status} />
                </td>
                <td>
                  {b.startedAt && b.finishedAt
                    ? `${Math.round((+new Date(b.finishedAt) - +new Date(b.startedAt)) / 1000)} s`
                    : '–'}
                </td>
                <td>
                  <button className="btn small" onClick={() => setOpen(b.id)}>
                    Details
                  </button>
                  {b.errorSummary && (
                    <div className="err small">{b.errorSummary.split('\n')[0]}</div>
                  )}
                </td>
              </tr>
            ))}
            {builds.data?.builds.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Noch keine Builds.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h2>Releases</h2>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Erstellt</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {releases.data?.releases.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.createdAt)}</td>
                <td>
                  {r.isActive ? (
                    <Pill value="published" />
                  ) : r.removed ? (
                    <span className="muted">aufgeräumt</span>
                  ) : (
                    <span className="muted">inaktiv</span>
                  )}
                </td>
                <td>
                  {user.role === 'admin' && !r.isActive && !r.removed && (
                    <button
                      className="btn small danger"
                      onClick={() =>
                        confirm('Auf dieses Release zurückschalten?') && rollback.mutate(r.id)
                      }
                    >
                      Rollback
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <BuildDetail id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BuildDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['build', id],
    queryFn: () =>
      api.get<{
        build: Build & {
          log: string | null;
          checks: { problems?: string[]; passed?: boolean } | null;
        };
      }>(`/builds/${id}`),
  });
  const b = q.data?.build;
  return (
    <Modal title="Build-Details" onClose={onClose}>
      {q.error && <Notice>{errText(q.error)}</Notice>}
      {b && (
        <>
          <p>
            <Pill value={b.status} />{' '}
            {b.errorSummary && <span className="err">{b.errorSummary}</span>}
          </p>
          {b.checks && (
            <>
              <h3>Prüfungen</h3>
              <p>{b.checks.passed ? 'Alle bestanden.' : (b.checks.problems ?? []).join(' · ')}</p>
            </>
          )}
          <h3>Log</h3>
          <pre className="log">{b.log ?? '(leer)'}</pre>
        </>
      )}
    </Modal>
  );
}
