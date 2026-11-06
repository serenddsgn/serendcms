import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

function Item({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const handle = (
    <button
      type="button"
      className="handle"
      aria-label="Verschieben (Pfeiltasten nach Leertaste)"
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children(handle)}
    </div>
  );
}

/** Sortierbare Liste (Maus, Touch und Tastatur) per dnd-kit. */
export function Sortable<T>({
  items,
  getId,
  onReorder,
  render,
}: {
  items: T[];
  getId: (i: T) => string;
  onReorder: (next: T[]) => void;
  render: (item: T, index: number, handle: ReactNode) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const end = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onReorder(arrayMove(items, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((it, i) => (
          <Item key={getId(it)} id={getId(it)}>
            {(handle) => render(it, i, handle)}
          </Item>
        ))}
      </SortableContext>
    </DndContext>
  );
}
