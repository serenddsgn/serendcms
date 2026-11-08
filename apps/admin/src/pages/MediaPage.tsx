import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { MediaDto } from '@serend/schema';
import { api, fileUrl, thumbUrl } from '../api';
import { Field, Modal, Notice, errText, useAction } from '../ui';

export function MediaPage() {
  const q = useQuery({
    queryKey: ['media'],
    queryFn: () => api.get<{ media: MediaDto[]; total: number }>('/media?limit=200'),
  });
  const [sel, setSel] = useState<MediaDto | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const upload = useAction(
    (f: File) => api.upload<{ media: MediaDto }>('/media', f),
    [['media'], ['media', 'picker']],
    (r) => setSel(r.media),
  );
  return (
    <>
      <h1>Medien</h1>
      <p className="muted">
        JPEG, PNG, WebP und AVIF sowie Videos als MP4 (H.264) oder WebM (Typ wird anhand der Datei
        geprüft). Videos laufen auf der Website stumm in Schleife, z. B. als Cover oder in der
        Galerie. Jedes Bild und Video braucht Alt-Texte in den Sprachen, in denen es veröffentlicht
        wird.
      </p>
      {(q.error || upload.error) && <Notice>{errText(q.error ?? upload.error)}</Notice>}
      <div className="row" style={{ margin: '12px 0' }}>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm"
          aria-label="Bild hochladen"
          style={{ maxWidth: 320 }}
        />
        <button
          className="btn primary"
          disabled={upload.isPending}
          onClick={() => {
            const f = file.current?.files?.[0];
            if (f) upload.mutate(f);
          }}
        >
          Hochladen
        </button>
      </div>
      <div className="mediagrid">
        {q.data?.media.map((m) => (
          <button key={m.id} className="item" onClick={() => setSel(m)}>
            <img src={thumbUrl(m.id)} alt={m.altText.de ?? ''} loading="lazy" />
            <div className="cap">
              {m.filename}
              <br />
              <span className="muted">
                {m.mime.startsWith('video/') ? 'Video · ' : ''}
                {m.width}×{m.height}
                {m.inUse ? ' · verwendet' : ''}
                {!m.altText.de ? ' · Alt DE fehlt' : ''}
              </span>
            </div>
          </button>
        ))}
      </div>
      {sel && <MediaDetail media={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function MediaDetail({ media, onClose }: { media: MediaDto; onClose: () => void }) {
  const [alt, setAlt] = useState({ de: media.altText.de ?? '', en: media.altText.en ?? '' });
  const [focal, setFocal] = useState({ x: media.focalX, y: media.focalY });
  const keys = [['media'], ['media', 'picker']];
  const save = useAction(
    () => api.patch(`/media/${media.id}`, { altText: alt, focalX: focal.x, focalY: focal.y }),
    keys,
    onClose,
  );
  const remove = useAction(() => api.del(`/media/${media.id}`), keys, onClose);
  return (
    <Modal title={media.filename} onClose={onClose}>
      {(save.error || remove.error) && <Notice>{errText(save.error ?? remove.error)}</Notice>}
      {media.mime.startsWith('video/') ? (
        <video
          src={fileUrl(media.id)}
          controls
          muted
          playsInline
          preload="metadata"
          style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }}
        />
      ) : (
        <img
          src={thumbUrl(media.id, 800)}
          alt=""
          style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8 }}
        />
      )}
      <p className="muted small">
        {media.mime} · {media.width}×{media.height} · {(media.byteSize / 1024).toFixed(0)} KB{' '}
        {media.inUse ? '· wird verwendet' : ''}
      </p>
      <div className="grid2">
        <Field label="Alt-Text (DE)">
          <input value={alt.de} onChange={(e) => setAlt({ ...alt, de: e.target.value })} />
        </Field>
        <Field label="Alt-Text (EN)">
          <input value={alt.en} onChange={(e) => setAlt({ ...alt, en: e.target.value })} />
        </Field>
        <Field label="Fokuspunkt X (%)">
          <input
            type="number"
            min={0}
            max={100}
            value={focal.x}
            onChange={(e) => setFocal({ ...focal, x: Number(e.target.value) })}
          />
        </Field>
        <Field label="Fokuspunkt Y (%)">
          <input
            type="number"
            min={0}
            max={100}
            value={focal.y}
            onChange={(e) => setFocal({ ...focal, y: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => save.mutate(undefined)}>
          Speichern
        </button>
        <button
          className="btn danger"
          disabled={media.inUse}
          title={media.inUse ? 'Wird noch verwendet' : ''}
          onClick={() => confirm('Bild löschen?') && remove.mutate(undefined)}
        >
          Löschen
        </button>
      </div>
    </Modal>
  );
}
