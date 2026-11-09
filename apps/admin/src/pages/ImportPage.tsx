import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  IMPORT_EXAMPLE,
  buildImport,
  buildImportGuide,
  type ImportPlanItem,
  type MediaDto,
} from '@serend/schema';
import { api } from '../api';
import { Notice, errText } from '../ui';

/** Alle Medien laden (die API liefert höchstens 200 je Seite). */
async function loadAllMedia(): Promise<MediaDto[]> {
  const all: MediaDto[] = [];
  for (let offset = 0; offset < 5000; offset += 200) {
    const r = await api.get<{ media: MediaDto[]; total: number }>(
      `/media?limit=200&offset=${offset}`,
    );
    all.push(...r.media);
    if (all.length >= r.total || r.media.length === 0) break;
  }
  return all;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

type Result = { ok: true; id: string } | { ok: false; message: string };

export function ImportPage() {
  const media = useQuery({ queryKey: ['media', 'all'], queryFn: loadAllMedia });
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<Record<number, Result>>({});
  const [running, setRunning] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const check = useMemo(() => {
    if (!text.trim()) return null;
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { items: [], errors: [`Kein gültiges JSON: ${(e as Error).message}`] };
    }
    return buildImport(json, { media: media.data ?? [] });
  }, [text, media.data]);

  const run = async () => {
    if (!check || check.errors.length > 0 || check.items.length === 0) return;
    setRunning(true);
    setResults({});
    // Sprachversionen: das zuerst angelegte Element einer Gruppe bestimmt die translationGroupId der übrigen
    const groups = new Map<string, string>();
    for (const item of check.items) {
      try {
        const gid = item.group ? groups.get(item.group) : undefined;
        const body = { ...item.body, ...(gid ? { translationGroupId: gid } : {}) };
        let id: string;
        let translationGroupId: string;
        if (item.kind === 'project') {
          const r = await api.post<{
            project: { id: string; translationGroupId: string };
          }>('/projects', body);
          id = r.project.id;
          translationGroupId = r.project.translationGroupId;
        } else {
          const r = await api.post<{ page: { id: string; translationGroupId: string } }>(
            '/pages',
            body,
          );
          id = r.page.id;
          translationGroupId = r.page.translationGroupId;
        }
        if (item.group && !gid) groups.set(item.group, translationGroupId);
        setResults((r) => ({ ...r, [item.index]: { ok: true, id } }));
      } catch (e) {
        setResults((r) => ({ ...r, [item.index]: { ok: false, message: errText(e) } }));
      }
    }
    setRunning(false);
  };

  const guide = () =>
    download(
      'serend-import-anleitung.md',
      buildImportGuide(
        media.data?.map((m) => ({ filename: m.filename, altText: m.altText.de || m.altText.en })),
      ),
      'text/markdown',
    );
  const done = Object.keys(results).length;
  const failed = Object.values(results).filter((r) => !r.ok).length;
  const blocked = !check || check.errors.length > 0 || check.items.length === 0;

  return (
    <>
      <h1>Import</h1>
      <p className="muted">
        Texte extern mit einer KI erstellen und hier als Entwürfe einlesen. Es wird nichts
        veröffentlicht.
      </p>

      <h2>1. Anleitung für die KI</h2>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Die Anleitung beschreibt Format, Grenzen, Schreibstil und enthält ein vollständiges
          Beispiel. Gib sie der KI zusammen mit deinem Briefing (Kunde, Fakten, gewünschte Sprache)
          und lass sie die JSON-Datei erzeugen. Die Anleitung enthält die aktuelle Medienliste,
          damit nur vorhandene Bilder verwendet werden.
        </p>
        {media.isError && <Notice>{errText(media.error)}</Notice>}
        <div className="row">
          <button type="button" className="btn primary" onClick={guide} disabled={media.isLoading}>
            Anleitung herunterladen (.md)
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              download(
                'serend-import-beispiel.json',
                JSON.stringify(IMPORT_EXAMPLE, null, 2),
                'application/json',
              )
            }
          >
            Beispiel herunterladen (.json)
          </button>
          <span className="small muted">
            {media.data
              ? `${media.data.length} Medien in der Bibliothek`
              : 'Medien werden geladen …'}
          </span>
        </div>
      </div>

      <h2>2. Datei einlesen</h2>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            aria-label="Importdatei wählen"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              setResults({});
              setText(await f.text());
            }}
          />
          {fileName && <span className="small muted">{fileName}</span>}
        </div>
        <textarea
          aria-label="JSON der Importdatei"
          placeholder="… oder das JSON hier einfügen"
          value={text}
          rows={8}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}
          onChange={(e) => {
            setText(e.target.value);
            setResults({});
          }}
        />
      </div>

      {check && (
        <>
          <h2>3. Prüfung</h2>
          {check.errors.length > 0 && (
            <Notice>
              <strong>Die Datei kann so nicht importiert werden:</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                {check.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <span className="small">
                Tipp: Fehlermeldung kopieren und der KI zurückgeben, sie korrigiert die Datei.
              </span>
            </Notice>
          )}
          {check.items.map((it) => (
            <ItemCard key={it.index} item={it} result={results[it.index]} />
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn primary"
              disabled={blocked || running || done === check.items.length}
              onClick={() => void run()}
            >
              {running
                ? `Importiere … (${done}/${check.items.length})`
                : `${check.items.length} ${check.items.length === 1 ? 'Eintrag' : 'Einträge'} als Entwurf importieren`}
            </button>
            {done === check.items.length && !running && (
              <span className={failed ? 'small' : 'small muted'}>
                {failed
                  ? `${failed} von ${done} fehlgeschlagen. Bereits angelegte Einträge bleiben bestehen.`
                  : 'Fertig. Die Entwürfe findest du unter Projekte bzw. Seiten.'}
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}

function ItemCard({ item, result }: { item: ImportPlanItem; result: Result | undefined }) {
  const blocks = (item.body as { content: unknown[] }).content.length;
  const where = item.kind === 'project' ? 'projects' : 'pages';
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div className="row between">
        <div>
          <strong>{item.title}</strong>{' '}
          <span className="small muted">
            {item.kind === 'project' ? 'Projekt' : 'Seite'} · {item.locale.toUpperCase()} · /
            {item.slug}/ · {blocks} {blocks === 1 ? 'Block' : 'Blöcke'}
            {item.group ? ` · Gruppe „${item.group}“` : ''}
          </span>
        </div>
        {result?.ok && (
          <Link className="btn small" to={`/${where}/${result.id}`}>
            Entwurf öffnen
          </Link>
        )}
      </div>
      {item.warnings.length > 0 && (
        <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--warn)' }}>
          {item.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {result && !result.ok && (
        <Notice>
          <>Nicht importiert: {result.message}</>
        </Notice>
      )}
      {result?.ok && (
        <div className="small" style={{ color: 'var(--ok)' }}>
          Als Entwurf angelegt.
        </div>
      )}
    </div>
  );
}
