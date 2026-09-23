"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTripStore } from "@/lib/store/trip-store";
import type { PlaceRef, TripStop } from "@/lib/types/trip";
import { Button, EmptyHint } from "@/components/ui/primitives";
import { PlaceSearch } from "@/components/trip/PlaceSearch";

function SortableStop({
  stop,
  index,
  onEdit,
  onRemove,
}: {
  stop: TripStop;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stop.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2 py-2 ${
        isDragging ? "z-10 shadow-lg opacity-95" : ""
      }`}
    >
      <button
        type="button"
        className="touch-none rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        aria-label="Trascina per riordinare"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[10px] font-bold text-[var(--brand)]">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">
          {stop.place.label}
        </p>
        {stop.place.address ? (
          <p className="truncate text-[11px] text-[var(--ink-muted)]">
            {stop.place.address}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Modifica tappa"
        className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Elimina tappa"
        className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function StopList() {
  const stops = useTripStore((s) => s.trip.stops);
  const addStop = useTripStore((s) => s.addStop);
  const updateStop = useTripStore((s) => s.updateStop);
  const removeStop = useTripStore((s) => s.removeStop);
  const reorderStops = useTripStore((s) => s.reorderStops);
  const mapPickTarget = useTripStore((s) => s.mapPickTarget);
  const setMapPickTarget = useTripStore((s) => s.setMapPickTarget);
  const optimizeStopOrder = useTripStore((s) => s.trip.optimizeStopOrder);
  const setOptimizeStopOrder = useTripStore((s) => s.setOptimizeStopOrder);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = stops.findIndex((s) => s.id === active.id);
    const to = stops.findIndex((s) => s.id === over.id);
    if (from >= 0 && to >= 0) reorderStops(from, to);
  }

  function handleAdd(place: PlaceRef) {
    if (editingId) {
      updateStop(editingId, place);
      setEditingId(null);
    } else {
      addStop(place);
    }
    setAdding(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--ink-muted)]">
          Trascina per riordinare · {stops.length} tappe
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
        >
          Aggiungi tappa
        </Button>
      </div>

      {stops.length === 0 && !adding ? (
        <EmptyHint>
          Nessuna tappa intermedia. Aggiungine quante ne servono oppure
          selezionale sulla mappa.
        </EmptyHint>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={stops.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {stops.map((stop, index) => (
              <SortableStop
                key={stop.id}
                stop={stop}
                index={index}
                onEdit={() => {
                  setEditingId(stop.id);
                  setAdding(true);
                }}
                onRemove={() => removeStop(stop.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {adding ? (
        <div className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand-soft)]/40 p-3 animate-[fadeSlide_180ms_ease]">
          <PlaceSearch
            label={editingId ? "Modifica tappa" : "Nuova tappa"}
            value={null}
            onSelect={handleAdd}
            onPickFromMap={() => setMapPickTarget("stop")}
            pickingFromMap={mapPickTarget === "stop"}
          />
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setEditingId(null);
                if (mapPickTarget === "stop") setMapPickTarget(null);
              }}
            >
              Chiudi
            </Button>
          </div>
        </div>
      ) : null}

      {stops.length >= 2 ? (
        <label className="flex items-start gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--ink-muted)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={optimizeStopOrder}
            onChange={(e) => setOptimizeStopOrder(e.target.checked)}
          />
          <span>
            Consenti l’ottimizzazione dell’ordine delle tappe al calcolo
            (solo con il tuo consenso esplicito).
          </span>
        </label>
      ) : null}
    </div>
  );
}
