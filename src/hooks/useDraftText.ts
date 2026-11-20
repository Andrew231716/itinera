"use client";
import { useEffect, useState } from "react";
export function useDraftText(key: string) {
  const [text, setText] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setText(localStorage.getItem(key) ?? "");
    } catch {
      /* Keep the editable field available. */
    }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(key, text);
      } catch {
        /* The main workspace reports storage limits. */
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [key, text, ready]);
  return [text, setText] as const;
}
