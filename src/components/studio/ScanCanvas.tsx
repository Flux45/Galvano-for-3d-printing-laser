import { useEffect, useRef } from "react";
import type { Point, Shape, Toolpath } from "../../lib/types";
import { shapeToPolygon } from "../../lib/geometry";

interface Props {
  shapes: Shape[];
  toolpath: Toolpath;
  fieldSizeMm: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, cx: number, cy: number) => void;
  progress: number | null; // 0..1 while animating, null = show full path
  showHatch: boolean;
  showJumps: boolean;
}

const SIZE = 560;

export default function ScanCanvas({
  shapes,
  toolpath,
  fieldSizeMm,
  selectedId,
  onSelect,
  onMove,
  progress,
  showHatch,
  showJumps,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draggingRef = useRef<string | null>(null);

  const scale = SIZE / fieldSizeMm;
  const toPx = (p: Point) => ({ x: SIZE / 2 + p.x * scale, y: SIZE / 2 - p.y * scale });
  const toMm = (x: number, y: number) => ({ x: (x - SIZE / 2) / scale, y: -(y - SIZE / 2) / scale });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.style.width = `${SIZE}px`;
    canvas.style.height = `${SIZE}px`;
    ctx.scale(dpr, dpr);

    draw(ctx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, toolpath, fieldSizeMm, selectedId, progress, showHatch, showJumps]);

  function draw(ctx: CanvasRenderingContext2D) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "#070b12";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // grid
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    const step = 10; // mm
    for (let x = -fieldSizeMm / 2; x <= fieldSizeMm / 2; x += step) {
      const p1 = toPx({ x, y: -fieldSizeMm / 2 });
      const p2 = toPx({ x, y: fieldSizeMm / 2 });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let y = -fieldSizeMm / 2; y <= fieldSizeMm / 2; y += step) {
      const p1 = toPx({ x: -fieldSizeMm / 2, y });
      const p2 = toPx({ x: fieldSizeMm / 2, y });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // field boundary (circular effective scan area) + bounding square
    ctx.strokeStyle = "rgba(34,211,238,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, (fieldSizeMm / 2) * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(148,163,184,0.25)";
    ctx.strokeRect(toPx({ x: -fieldSizeMm / 2, y: fieldSizeMm / 2 }).x, toPx({ x: -fieldSizeMm / 2, y: fieldSizeMm / 2 }).y, fieldSizeMm * scale, fieldSizeMm * scale);

    // center crosshair
    ctx.strokeStyle = "rgba(148,163,184,0.4)";
    ctx.beginPath();
    ctx.moveTo(SIZE / 2 - 6, SIZE / 2);
    ctx.lineTo(SIZE / 2 + 6, SIZE / 2);
    ctx.moveTo(SIZE / 2, SIZE / 2 - 6);
    ctx.lineTo(SIZE / 2, SIZE / 2 + 6);
    ctx.stroke();

    // shapes (cured resin preview)
    for (const shape of shapes) {
      const poly = shapeToPolygon(shape).map(toPx);
      ctx.beginPath();
      poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = shape.id === selectedId ? "rgba(103,232,249,0.18)" : "rgba(103,232,249,0.08)";
      ctx.fill();
      ctx.strokeStyle = shape.id === selectedId ? "#67e8f9" : "rgba(103,232,249,0.4)";
      ctx.lineWidth = shape.id === selectedId ? 2 : 1;
      ctx.stroke();
    }

    // toolpath
    const totalLen = pathLength(toolpath);
    const limit = progress === null ? Infinity : progress * totalLen;
    let acc = 0;
    let lastPt: Point | null = null;

    for (const seg of toolpath.segments) {
      for (let i = 0; i + 1 < seg.points.length; i++) {
        const a = seg.points[i];
        const b = seg.points[i + 1];
        const segLen = Math.hypot(a.x - b.x, a.y - b.y);
        if (seg.isJump && !showJumps) {
          acc += segLen;
          lastPt = b;
          continue;
        }
        let drawA = a;
        let drawB = b;
        let partial = false;
        if (acc + segLen > limit) {
          const t = Math.max(0, (limit - acc) / segLen);
          drawB = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          partial = true;
        }
        if (acc < limit) {
          const pA = toPx(drawA);
          const pB = toPx(drawB);
          ctx.beginPath();
          ctx.moveTo(pA.x, pA.y);
          ctx.lineTo(pB.x, pB.y);
          if (seg.isJump) {
            ctx.strokeStyle = "rgba(234,179,8,0.55)";
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
          } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = "#fb7185";
            ctx.lineWidth = 1.4;
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        acc += segLen;
        lastPt = partial ? drawB : b;
        if (partial) break;
      }
      if (acc >= limit) break;
    }

    // laser spot marker during animation
    if (progress !== null && lastPt) {
      const p = toPx(lastPt);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#fde047";
      ctx.shadowColor = "#fde047";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (!showHatch) {
      // overlay note handled by parent toggle (hatch filtered before passed in for perf-simple approach not needed here)
    }
  }

  function pathLength(tp: Toolpath) {
    let len = 0;
    for (const seg of tp.segments) {
      if (seg.isJump && !showJumps) continue;
      for (let i = 0; i + 1 < seg.points.length; i++) {
        len += Math.hypot(seg.points[i].x - seg.points[i + 1].x, seg.points[i].y - seg.points[i + 1].y);
      }
    }
    return len;
  }

  function hitTest(x: number, y: number): string | null {
    const mm = toMm(x, y);
    let best: { id: string; d: number } | null = null;
    for (const shape of shapes) {
      const d = Math.hypot(mm.x - shape.cx, mm.y - shape.cy);
      if (d < shape.size + 4 && (!best || d < best.d)) best = { id: shape.id, d };
    }
    return best?.id ?? null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full cursor-crosshair touch-none rounded-xl border border-white/10"
      onPointerDown={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * SIZE;
        const y = ((e.clientY - rect.top) / rect.height) * SIZE;
        const hit = hitTest(x, y);
        onSelect(hit);
        draggingRef.current = hit;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * SIZE;
        const y = ((e.clientY - rect.top) / rect.height) * SIZE;
        const mm = toMm(x, y);
        onMove(draggingRef.current, Number(mm.x.toFixed(2)), Number(mm.y.toFixed(2)));
      }}
      onPointerUp={() => {
        draggingRef.current = null;
      }}
    />
  );
}
