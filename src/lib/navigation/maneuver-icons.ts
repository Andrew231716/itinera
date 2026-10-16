import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  GitFork,
  Merge,
  RotateCcw,
  CircleDot,
} from "lucide-react";

export type ManeuverKind =
  | "straight"
  | "left"
  | "right"
  | "slight_left"
  | "slight_right"
  | "u_turn"
  | "roundabout"
  | "fork"
  | "merge"
  | "arrive";

/**
 * Map Italian/English step text to a turn kind for HUD icons.
 */
export function classifyManeuver(instruction: string | null | undefined): ManeuverKind {
  const t = (instruction ?? "").toLowerCase();
  if (!t) return "straight";
  if (/arriv|destinazione|sei arrivato/.test(t)) return "arrive";
  if (/rotonda|roundabout/.test(t)) return "roundabout";
  if (/inversione|u-?turn|fai dietro|girati/.test(t)) return "u_turn";
  if (/bivio|fork|diramazione/.test(t)) return "fork";
  if (/immett|merge|entra in/.test(t)) return "merge";
  if (/leggermente a sinistra|slight left|curva ampia a sinistra/.test(t))
    return "slight_left";
  if (/leggermente a destra|slight right|curva ampia a destra/.test(t))
    return "slight_right";
  if (/sinistr|left|gira a s/.test(t)) return "left";
  if (/destr|right|gira a d/.test(t)) return "right";
  if (/dritto|prosegui|continua|straight|avanti/.test(t)) return "straight";
  return "straight";
}

export function maneuverIcon(kind: ManeuverKind): LucideIcon {
  switch (kind) {
    case "left":
    case "slight_left":
      return CornerUpLeft;
    case "right":
    case "slight_right":
      return CornerUpRight;
    case "u_turn":
      return RotateCcw;
    case "roundabout":
      return CircleDot;
    case "fork":
      return GitFork;
    case "merge":
      return Merge;
    case "arrive":
      return Flag;
    default:
      return ArrowUp;
  }
}

/** Pull a short road name from "… e prendi Via Roma" / "su Via …" */
export function extractRoadHint(instruction: string | null | undefined): string | null {
  if (!instruction) return null;
  const m =
    instruction.match(
      /(?:prendi|su|verso|lungo|entra in)\s+((?:via|viale|corso|piazza|strada|autostrada|tangenziale|ss|sr|sp|a\d+)[^.,;]{0,48})/i,
    ) ??
    instruction.match(
      /\b((?:Via|Viale|Corso|Piazza|Strada|Autostrada)\s+[A-Za-zÀ-ú0-9'’.\-\s]{2,40})/,
    );
  return m?.[1]?.trim() ?? null;
}
