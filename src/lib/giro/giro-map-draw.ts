import type { PlaceRef } from "@/lib/types/trip";

export type GiroMapPoint = {
  index: number;
  label: string;
  location: { lat: number; lng: number };
};

/**
 * Project geographic points into a padded canvas rectangle (equirectangular).
 */
export function projectGiroPoints(
  points: Array<{ lat: number; lng: number }>,
  width: number,
  height: number,
  pad = 48,
): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / lngSpan, innerH / latSpan);
  const usedW = lngSpan * scale;
  const usedH = latSpan * scale;
  const ox = pad + (innerW - usedW) / 2;
  const oy = pad + (innerH - usedH) / 2;

  return points.map((p) => ({
    x: ox + (p.lng - minLng) * scale,
    y: oy + (maxLat - p.lat) * scale,
  }));
}

export function placesToMapPoints(
  origin: PlaceRef,
  stops: PlaceRef[],
): GiroMapPoint[] {
  return [
    { index: 0, label: origin.label, location: origin.location },
    ...stops.map((s, i) => ({
      index: i + 1,
      label: s.label,
      location: s.location,
    })),
  ];
}

/**
 * Draw a schematic route map onto a canvas (no external tiles required).
 * Markers are numbered only — names belong in the PDF legend so dense
 * stops stay readable.
 */
export function drawGiroMapCanvas(
  points: GiroMapPoint[],
  width = 900,
  height = 640,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 0, width, height);

  // Soft grid
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 40; y < height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const projected = projectGiroPoints(
    points.map((p) => p.location),
    width,
    height,
    36,
  );
  if (projected.length === 0) return canvas;

  // Route polyline
  if (projected.length > 1) {
    ctx.strokeStyle = "#0f766e";
    ctx.lineWidth = 3.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
      ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.stroke();
  }

  // Numbered markers only (no name labels — those go in the legend)
  const radius = points.length > 12 ? 11 : 13;
  const fontSize = points.length > 12 ? 11 : 12;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const { x, y } = projected[i];
    const isStart = i === 0;
    const isEnd = i === points.length - 1;

    ctx.beginPath();
    ctx.fillStyle = "#ffffff";
    ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = isStart ? "#0f766e" : isEnd ? "#b45309" : "#1d4ed8";
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${fontSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(p.index + 1), x, y + 0.5);
  }

  return canvas;
}
