import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { FeaturedSize } from '@serend/schema';
import { api, thumbUrl } from '../api';
import { LocaleSwitch, Notice, errText, useAction, useLocale } from '../ui';

interface Item {
  id: string;
  status: string;
  title: string;
  slug: string;
  year: number;
  color: string;
  coverMediaId: string | null;
  featured: boolean;
  featuredSortOrder: number | null;
  featuredSize: FeaturedSize;
}
interface Entry {
  id: string;
  size: FeaturedSize;
}

/** Muss zur Startseite passen (apps/web, Sections.tsx): im Automodus bekommen die ersten Kacheln feste Größen. */
const AUTO_SIZE: FeaturedSize[] = [];
const SIZES: { value: FeaturedSize; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto', hint: 'Standard: klein (1 × 1)' },
  { value: 's', label: 'Klein', hint: '1 × 1' },
  { value: 'w', label: 'Breit', hint: '2 × 1' },
  { value: 't', label: 'Hoch', hint: '1 × 2' },
  { value: 'l', label: 'Groß', hint: '2 × 2' },
];
const effective = (size: FeaturedSize, index: number): Exclude<FeaturedSize, 'auto'> =>
  ((size === 'auto' ? AUTO_SIZE[index] : size) ?? 's') as Exclude<FeaturedSize, 'auto'>;

const GRID = 'grid';
const POOL = 'pool';
const pooled = (id: string) => `pool:${id}`;

const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  const found = hits.length > 0 ? hits : rectIntersection(args);
  // konkrete Kachel schlägt den umgebenden Drop-Bereich
  const specific = found.filter((c) => c.id !== GRID && c.id !== POOL);
  return specific.length > 0 ? specific : found;
};

export function LayoutPage() {
  const [locale, setLocale] = useLocale();
  const [local, setLocal] = useState<Entry[] | null>(null);
  const [both, setBoth] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  // „live“: alle 10 s und beim Zurückkehren in den Tab neu laden, damit neue oder veröffentlichte Projekte erscheinen
  const q = useQuery({
    queryKey: ['projects', locale],
    queryFn: () => api.get<{ projects: Item[] }>(`/projects?locale=${locale}`),
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
  const all = useMemo(() => q.data?.projects ?? [], [q.data]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);

  const serverLayout = useMemo<Entry[]>(
    () =>
      all
        .filter((p) => p.featured)
        .sort((a, b) => (a.featuredSortOrder ?? 999) - (b.featuredSortOrder ?? 999))
        .map((p) => ({ id: p.id, size: p.featuredSize })),
    [all],
  );
  const layout = local ?? serverLayout;
  const inLayout = new Set(layout.map((e) => e.id));
  const pool = all.filter((p) => p.status === 'published' && !inLayout.has(p.id));
  const drafts = all.filter((p) => p.status !== 'published' && !inLayout.has(p.id)).length;

  const save = useAction(
    (items: Entry[]) =>
      api.put('/projects/featured-layout', { locale, items, applyToOtherLocales: both }),
    [['projects']],
    () => setLocal(null),
  );
  const commit = (next: Entry[]) => {
    setLocal(next);
    save.mutate(next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { setNodeRef: gridRef, isOver: gridOver } = useDroppable({ id: GRID });
  const { setNodeRef: poolRef, isOver: poolOver } = useDroppable({ id: POOL });

  const add = (id: string, at?: number) => {
    const next = layout.slice();
    next.splice(at ?? next.length, 0, { id, size: 'auto' });
    commit(next);
  };
  const remove = (id: string) => commit(layout.filter((e) => e.id !== id));
  const resize = (id: string, size: FeaturedSize) =>
    commit(layout.map((e) => (e.id === id ? { ...e, size } : e)));

  const onStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onEnd = (e: DragEndEvent) => {
    setDragging(null);
    const active = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    const ids = layout.map((x) => x.id);
    if (active.startsWith('pool:')) {
      const id = active.slice(5);
      if (over === GRID) add(id);
      else if (ids.includes(over)) add(id, ids.indexOf(over));
      return;
    }
    if (over === POOL || over.startsWith('pool:')) return remove(active);
    if (over !== GRID && over !== active && ids.includes(over)) {
      commit(arrayMove(layout, ids.indexOf(active), ids.indexOf(over)));
    }
  };

  const draggedId = dragging?.replace(/^pool:/, '') ?? null;
  const dragged = draggedId ? byId.get(draggedId) : undefined;
  const error = q.error ?? save.error;

  return (
    <>
      <div className="row between">
        <div>
          <h1>Startseiten-Layout</h1>
          <p className="muted">
            Projekte aus dem Pool in die Auswahl ziehen, per Drag & Drop anordnen und die
            Kachelgröße festlegen. Änderungen gelten nach der nächsten Veröffentlichung.
          </p>
        </div>
        <div className="row">
          <LocaleSwitch
            value={locale}
            onChange={(l) => {
              setLocal(null);
              setLocale(l);
            }}
          />
        </div>
      </div>
      {error && <Notice>{errText(error)}</Notice>}
      <div className="row between lb-bar">
        <label className="row small">
          <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
          Auswahl auch auf die verknüpfte Sprachversion übertragen
        </label>
        <div className="row small muted" role="status">
          {save.isPending ? 'Speichert …' : q.isFetching ? 'Aktualisiert …' : 'Gespeichert'}
          <button
            className="btn small"
            disabled={layout.every((e) => e.size === 'auto')}
            onClick={() => commit(layout.map((e) => ({ ...e, size: 'auto' })))}
          >
            Alle auf Auto
          </button>
        </div>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        onDragStart={onStart}
        onDragEnd={onEnd}
        onDragCancel={() => setDragging(null)}
      >
        <h2>Auswahl auf der Startseite ({layout.length})</h2>
        <div ref={gridRef} className={`lb-stage ${gridOver ? 'over' : ''}`}>
          <SortableContext items={layout.map((e) => e.id)} strategy={rectSortingStrategy}>
            <div className="lb-grid">
              {layout.map((e, i) => {
                const p = byId.get(e.id);
                return p ? (
                  <Tile
                    key={e.id}
                    item={p}
                    entry={e}
                    index={i}
                    onSize={(s) => resize(e.id, s)}
                    onRemove={() => remove(e.id)}
                  />
                ) : null;
              })}
            </div>
          </SortableContext>
          {layout.length === 0 && (
            <p className="muted lb-empty">
              Noch keine Projekte. Ziehe welche aus dem Pool hierher.
            </p>
          )}
        </div>
        <h2>Verfügbare Projekte ({pool.length})</h2>
        <div ref={poolRef} className={`lb-pool ${poolOver ? 'over' : ''}`}>
          {pool.map((p) => (
            <PoolItem key={p.id} item={p} onAdd={() => add(p.id)} />
          ))}
          {pool.length === 0 && (
            <p className="muted">Alle veröffentlichten Projekte sind in der Auswahl.</p>
          )}
        </div>
        {drafts > 0 && (
          <p className="small muted">
            {drafts === 1 ? '1 Projekt ist' : `${drafts} Projekte sind`} nicht veröffentlicht und
            deshalb nicht wählbar.
          </p>
        )}
        <DragOverlay>
          {dragged && (
            <div className="lb-ghost" style={{ background: dragged.color }}>
              {dragged.coverMediaId && <img src={thumbUrl(dragged.coverMediaId, 320)} alt="" />}
              <span>{dragged.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  );
}

function Tile({
  item,
  entry,
  index,
  onSize,
  onRemove,
}: {
  item: Item;
  entry: Entry;
  index: number;
  onSize: (s: FeaturedSize) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const size = effective(entry.size, index);
  return (
    <div
      ref={setNodeRef}
      className={`lb-tile sz-${size} ${isDragging ? 'drag' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition, background: item.color }}
    >
      {item.coverMediaId && <img src={thumbUrl(item.coverMediaId, 640)} alt="" draggable={false} />}
      <button
        type="button"
        className="lb-grab"
        aria-label={`${item.title} verschieben (Leertaste, dann Pfeiltasten)`}
        {...attributes}
        {...listeners}
      >
        <span className="lb-title">{item.title}</span>
        <span className="lb-pos">{String(index + 1).padStart(2, '0')}</span>
      </button>
      <button
        type="button"
        className="lb-remove"
        aria-label={`${item.title} aus der Auswahl entfernen`}
        onClick={onRemove}
      >
        ×
      </button>
      <div className="lb-sizes" role="group" aria-label={`Größe von ${item.title}`}>
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.value === 'auto' ? `${s.hint} (aktuell ${size})` : s.hint}
            aria-pressed={entry.size === s.value}
            className={entry.size === s.value ? 'on' : ''}
            onClick={() => onSize(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {item.status !== 'published' && <span className="lb-draft">Entwurf, nicht live</span>}
    </div>
  );
}

function PoolItem({ item, onAdd }: { item: Item; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pooled(item.id) });
  return (
    <div ref={setNodeRef} className={`lb-chip ${isDragging ? 'drag' : ''}`}>
      <div className="lb-chip-main" {...attributes} {...listeners}>
        {item.coverMediaId ? (
          <img src={thumbUrl(item.coverMediaId, 160)} alt="" draggable={false} />
        ) : (
          <span className="lb-nothumb" style={{ background: item.color }} />
        )}
        <span>
          <strong>{item.title}</strong>
          <span className="small muted"> · {item.year}</span>
        </span>
      </div>
      <button
        type="button"
        className="btn small"
        onClick={onAdd}
        aria-label={`${item.title} zur Auswahl hinzufügen`}
      >
        +
      </button>
    </div>
  );
}
