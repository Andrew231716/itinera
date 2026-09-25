"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { ComputedRoute } from "@/lib/types/route";
import {
  getTrafficInfo,
  TRAFFIC_MONITOR_INTERVAL_MS,
  type TrafficLevel,
} from "@/lib/routing/traffic-info";
import { formatDuration, formatRelativeIt } from "@/lib/utils/format";
import { Badge, Button } from "@/components/ui/primitives";
import { useRouteCompute } from "@/hooks/useRouteCompute";

function trafficTone(
  level: TrafficLevel,
): "ok" | "warn" | "demo" | "neutral" | "brand" {
  switch (level) {
    case "fluid":
      return "ok";
    case "moderate":
      return "demo";
    case "heavy":
    case "severe":
      return "warn";
    default:
      return "neutral";
  }
}

function trafficBoxClass(level: TrafficLevel): string {
  switch (level) {
    case "fluid":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "moderate":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "heavy":
    case "severe":
      return "border-red-200 bg-red-50 text-red-950";
    default:
      return "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-muted)]";
  }
}

export function TrafficMonitorPanel({ route }: { route: ComputedRoute }) {
  const traffic = getTrafficInfo(route);
  const { computeRoute } = useRouteCompute();
  const computeRef = useRef(computeRoute);
  computeRef.current = computeRoute;

  const [monitoring, setMonitoring] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setLastCheckedAt(new Date().toISOString());
  }, [route.id, route.durationSeconds, route.staticDurationSeconds]);

  useEffect(() => {
    if (!monitoring) return;
    const id = window.setInterval(() => {
      void (async () => {
        setRefreshing(true);
        try {
          await computeRef.current();
        } finally {
          setRefreshing(false);
        }
      })();
    }, TRAFFIC_MONITOR_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [monitoring]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await computeRef.current();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      className={`space-y-2 rounded-xl border px-3 py-3 text-xs ${trafficBoxClass(traffic.level)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{traffic.label}</p>
            <p className="mt-0.5 leading-relaxed opacity-90">{traffic.summary}</p>
          </div>
        </div>
        <Badge tone={trafficTone(traffic.level)}>
          {traffic.level === "unknown"
            ? "n/d"
            : traffic.delaySeconds < 60
              ? "<1 min"
              : `+${Math.round(traffic.delaySeconds / 60)} min`}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] opacity-90">
        <span>Live {formatDuration(traffic.liveDurationSeconds)}</span>
        {traffic.staticDurationSeconds != null ? (
          <span>
            Senza traffico {formatDuration(traffic.staticDurationSeconds)}
          </span>
        ) : null}
        {lastCheckedAt ? (
          <span>Aggiornato {formatRelativeIt(lastCheckedAt)}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant={monitoring ? "secondary" : "outline"}
          onClick={() => setMonitoring((v) => !v)}
        >
          <Activity className="h-3.5 w-3.5" />
          {monitoring ? "Monitoraggio ON" : "Monitora traffico"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={refreshing}
          onClick={() => void refreshNow()}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Aggiorna ora
        </Button>
      </div>

      {monitoring ? (
        <p className="text-[10px] leading-relaxed opacity-80">
          Ricalcolo automatico ogni 3 minuti con Google Routes (traffico live).
          Si ferma quando disattivi il monitoraggio.
        </p>
      ) : null}
    </div>
  );
}
