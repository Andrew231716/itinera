/**
 * Extract a destination phrase from Italian (and light English) go-commands.
 * Examples:
 *  - "portami in via gardenie a Rozzano"
 *  - "portami a Milano Porta Genova"
 *  - "naviga verso il Duomo di Milano"
 *  - "via gardenie rozzano" (bare address)
 */
export function extractGoDestination(utterance: string): string | null {
  const raw = utterance.replace(/\s+/g, " ").trim();
  if (!raw) return null;

  let text = raw
    // Drop Siri / app name wrappers
    .replace(/^(?:hey|ehi|ok)\s+siri[,.]?\s*/i, "")
    .replace(/^siri[,.]?\s*/i, "")
    .replace(/\bcon\s+itinera\b/gi, "")
    .replace(/\bsu\s+itinera\b/gi, "")
    .replace(/\bin\s+itinera\b/gi, "")
    .trim();

  const patterns: RegExp[] = [
    /(?:portami|portamici|portaci|fammi\s+andare|voglio\s+andare|vorrei\s+andare|naviga(?:re)?|indicazioni(?:\s+per)?|direzioni(?:\s+per)?|vai|go)\s+(?:verso|fino\s+a|a|in|ad|alla|allo|alle|al|per)\s+(.+)/i,
    /(?:take\s+me|navigate|directions)\s+(?:to|towards)\s+(.+)/i,
    /^verso\s+(.+)/i,
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      text = m[1].trim();
      break;
    }
  }

  // Strip trailing filler
  text = text
    .replace(/[?.!,]+$/g, "")
    .replace(/\s+(per\s+favore|please|grazie)$/i, "")
    .trim();

  if (text.length < 3) return null;
  return text;
}

export function isGoLikeUtterance(utterance: string): boolean {
  return extractGoDestination(utterance) != null;
}
