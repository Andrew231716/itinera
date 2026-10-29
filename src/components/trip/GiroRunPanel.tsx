"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Flag,
  Pause,
  Play,
  SkipForward,
  Timer,
} from "lucide-react";
import type { ScheduleStop } from "@/lib/routing/travel-schedule";
import {
  addStopDelayMinutes,
  createGiroRun,
  markArrived,
  markDeparted,
  projectGiroRun,
  setStopDelayMinutes,
  skipCurrentStop,
  startGiroRun,
  stopGiroRun,
  toggleGiroPause,
  type GiroRunState,
} from "@/lib/giro/giro-run";
import { formatClockIt, formatDuration } from "@/lib/utils/format";
import { Button, Input, Label } from "@/components/ui/primitives";

export function GiroRunPanel({
  schedule,
}: {
  schedule: ScheduleStop[];
}) {
  const [run, setRun] = useState<GiroRunState>(() => createGiroRun(schedule));
  const [now, setNow] = useState(() => new Date());
  const [delayInput, setDelayInput] = useState("5");

  // Rebuild run logs when the planned schedule identity changes (new compute).
  const scheduleKey = useMemo(
    () =>
      schedule
        .map(
          (s) =>
            `${s.giroStopId ?? s.place.id}:${s.arrivalAt}:${s.dwellMinutes}:${s.legFromPreviousSeconds}`,
        )
        .join("|"),
    [schedule],
  );

  useEffect(() => {
    setRun(createGiroRun(schedule));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when plan changes
  }, [scheduleKey]);

  useEffect(() => {
    if (run.status !== "running" && run.status !== "paused") return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [run.status]);

  const projection = useMemo(
    () => projectGiroRun(run, schedule, now),
    [run, schedule, now],
  );
  const current = run.logs[run.currentIndex] ?? null;
  const active = run.status === "running" || run.status === "paused";

  return (
    <div className="space-y-3 rounded-xl border border-[var(--brand)]/30 bg-[var(--brand-soft)]/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--brand)] uppercase">
            <Flag className="h-3.5 w-3.5" />
            Avvio giro corriere
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
            Gestisci arrivi, fermate e ritardi: gli ETA delle tappe successive si
            aggiornano in base al tempo reale.
          </p>
        </div>
        {run.status === "idle" ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setRun((s) => startGiroRun(s))}
          >
            <Play className="h-3.5 w-3.5" />
            Avvia giro
          </Button>
        ) : run.status === "completed" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setRun(createGiroRun(schedule))}
          >
            Nuovo avvio
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setRun((s) => stopGiroRun(s))}
          >
            Esci
          </Button>
        )}
      </div>

      {run.status === "completed" ? (
        <p className="rounded-lg bg-[var(--surface)] px-3 py-2 text-sm text-emerald-800">
          Giro completato. Ottimo lavoro.
        </p>
      ) : null}

      {active && current ? (
        <div className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                {current.status === "at_stop"
                  ? "Alla tappa"
                  : current.status === "en_route"
                    ? "In viaggio verso"
                    : "Tappa"}
                {" · "}
                {current.scheduleIndex + 1}/{run.logs.length}
              </p>
              <p className="truncate text-base font-semibold text-[var(--ink)]">
                {current.label}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                Previsto {formatClockIt(current.plannedArrivalAt)}
                {current.dwellMinutes > 0
                  ? ` · fermata ${current.dwellMinutes} min`
                  : ""}
              </p>
              {projection.arrivalLabel ? (
                <p className="mt-1 text-xs font-medium text-[var(--ink)]">
                  {projection.arrivalLabel}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setRun((s) => toggleGiroPause(s));
                setNow(new Date());
              }}
            >
              {run.status === "paused" ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Riprendi
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pausa
                </>
              )}
            </Button>
          </div>

          {current.status === "at_stop" ? (
            <div className="space-y-2">
              {projection.suggestedDepartAt ? (
                <p className="flex items-center gap-1.5 text-sm text-[var(--ink)]">
                  <Timer className="h-4 w-4 text-[var(--brand)]" />
                  Parti alle {formatClockIt(projection.suggestedDepartAt)}
                  {projection.secondsToDepart != null
                    ? projection.secondsToDepart >= 0
                      ? ` · tra ${formatDuration(projection.secondsToDepart)}`
                      : ` · in ritardo di ${formatDuration(-projection.secondsToDepart)}`
                    : null}
                </p>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[5.5rem]">
                  <Label>Ritardo extra (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={delayInput}
                    onChange={(e) => setDelayInput(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const n = Number(delayInput);
                    if (!Number.isFinite(n)) return;
                    setRun((s) => setStopDelayMinutes(s, n));
                  }}
                >
                  Imposta
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRun((s) => addStopDelayMinutes(s, 5))}
                >
                  +5 min
                </Button>
              </div>
              {current.extraDelayMinutes > 0 ? (
                <p className="text-[11px] text-amber-800">
                  Ritardo aggiunto: {current.extraDelayMinutes} min (sposta gli
                  ETA successivi)
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setRun((s) => markDeparted(s));
                    setNow(new Date());
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Parti / fine fermata
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRun((s) => skipCurrentStop(s));
                    setNow(new Date());
                  }}
                >
                  <SkipForward className="h-4 w-4" />
                  Salta tappa
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                onClick={() => {
                  setRun((s) => markArrived(s));
                  setNow(new Date());
                }}
              >
                <Flag className="h-4 w-4" />
                Arrivato
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRun((s) => skipCurrentStop(s));
                  setNow(new Date());
                }}
              >
                <SkipForward className="h-4 w-4" />
                Salta
              </Button>
            </div>
          )}

          {projection.nextEtas.length > 0 ? (
            <div className="border-t border-[var(--line)] pt-2">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                <Clock3 className="h-3 w-3" />
                ETA ricalcolati
              </p>
              <ul className="space-y-1">
                {projection.nextEtas.slice(0, 5).map((e) => (
                  <li
                    key={e.index}
                    className="flex justify-between gap-2 text-[11px] text-[var(--ink)]"
                  >
                    <span className="truncate">{e.label}</span>
                    <span className="shrink-0 font-semibold">
                      {formatClockIt(e.eta)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {run.status !== "idle" ? (
        <ol className="space-y-1">
          {run.logs.map((log) => (
            <li
              key={log.scheduleIndex}
              className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface)]/80 px-2.5 py-1.5 text-[11px]"
            >
              <span className="min-w-0 truncate text-[var(--ink)]">
                {log.scheduleIndex + 1}. {log.label}
              </span>
              <span className="shrink-0 text-[var(--ink-muted)]">
                {log.status === "done"
                  ? "Fatta"
                  : log.status === "skipped"
                    ? "Saltata"
                    : log.status === "at_stop"
                      ? "Qui"
                      : log.status === "en_route"
                        ? "In viaggio"
                        : "In attesa"}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
