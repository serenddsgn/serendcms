import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { MediaDto } from '@serend/schema';
import { api, thumbUrl } from '../api';
import { Modal, Notice, errText, useAction } from '../ui';

export function MediaThumb({ id, size = 160 }: { id: string | null | undefined; size?: number }) {
  if (!id) return <div className="thumb" aria-hidden="true" />;
  return <img className="thumb" src={thumbUrl(id, size)} alt="" loading="lazy" />;
}

/** Auswahl aus der Medienbibliothek; Upload direkt im Dialog. */
export function MediaPicker({
  onPick,
  onClose,
}: {
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const list = useQuery({
    queryKey: ['media', 'picker'],
    queryFn: () => api.get<{ media: MediaDto[] }>('/media?limit=200'),
  });
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const upload = useAction(
    (f: File) => api.upload<{ media: MediaDto }>('/media', f),
    [['media', 'picker'], ['media']],
    (r) => onPick(r.media.id),
  );
  return (
    <Modal title="Bild oder Video wählen" onClose={onClose}>
      {(err || upload.error) && <Notice>{err ?? errText(upload.error)}</Notice>}
      <div className="row" style={{ margin: '12px 0' }}>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
          aria-label="Datei hochladen"
          style={{ maxWidth: 320 }}
        />
        <button
          className="btn primary small"
          disabled={upload.isPending}
          onClick={() => {
            const f = file.current?.files?.[0];
            if (!f) return setErr('Bitte eine Datei wählen.');
            setErr(null);
            upload.mutate(f);
          }}
        >
          Hochladen und wählen
        </button>
      </div>
      <div className="mediagrid">
        {list.data?.media.map((m) => (
          <button key={m.id} className="item" onClick={() => onPick(m.id)} title={m.filename}>
            <img src={thumbUrl(m.id)} alt="" loading="lazy" />
            <div className="cap">
              {m.filename}
              <br />
              <span className="muted">{m.altText.de || m.altText.en ? '' : 'ohne Alt-Text'}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Feld für ein einzelnes Medium (Cover, OG-Bild, Foto …). */
export function MediaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="field">
      <span
        className="lbl"
        style={{
          display: 'block',
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          color: 'var(--mute)',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <div className="row">
        <MediaThumb id={value} />
        <button type="button" className="btn small" onClick={() => setOpen(true)}>
          {value ? 'Ändern' : 'Wählen'}
        </button>
        {value && (
          <button type="button" className="btn small" onClick={() => onChange(null)}>
            Entfernen
          </button>
        )}
      </div>
      {open && (
        <MediaPicker
          onClose={() => setOpen(false)}
          onPick={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
