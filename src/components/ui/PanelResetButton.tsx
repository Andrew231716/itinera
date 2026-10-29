"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/** Compact header action used across trip panels. */
export function PanelResetButton({
  disabled = false,
  onClick,
  label = "Reset",
}: {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
