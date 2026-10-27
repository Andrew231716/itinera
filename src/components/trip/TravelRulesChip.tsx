"use client";

import { ListChecks } from "lucide-react";
import { useTripStore } from "@/lib/store/trip-store";
import {
  countActiveTravelRules,
  summarizeTravelRules,
} from "@/lib/routing/travel-rules";
import { cn } from "@/components/ui/primitives";

/**
 * Compact entry point to trip rules — tap opens the Regole panel.
 */
export function TravelRulesChip({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const preferences = useTripStore((s) => s.trip.preferences);
  const exclusions = useTripStore((s) => s.trip.exclusions);
  const setActivePanel = useTripStore((s) => s.setActivePanel);
  const setMobilePanelOpen = useTripStore((s) => s.setMobilePanelOpen);

  const count = countActiveTravelRules(preferences, exclusions);
  const summary = summarizeTravelRules(preferences, exclusions);

  function openRules() {
    setActivePanel("preferences");
    setMobilePanelOpen(true);
  }

  return (
    <button
      type="button"
      onClick={openRules}
      title={summary}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-left transition hover:bg-[var(--surface-2)]",
        count > 0
          ? "text-[var(--brand)]"
          : "text-[var(--ink-muted)]",
        className,
      )}
    >
      <ListChecks className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate text-[11px] font-semibold">
        {compact
          ? count > 0
            ? `${count} regole`
            : "Regole"
          : count > 0
            ? summary
            : "Regole del viaggio"}
      </span>
    </button>
  );
}
