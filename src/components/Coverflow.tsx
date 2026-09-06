"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type Cover = { id: string; src: string | null; alt: string };

/**
 * The shelf of app icons, raked away in three dimensions.
 *
 * Adapted from the coverflow pattern: the maths is the interesting part and it
 * is worth restating why it is shaped like this.
 *
 * ONE NUMBER IS THE TRUTH — `pos`, a fractional card index. Everything else is
 * derived from it and painted straight to the DOM, because sixty React renders
 * a second over twenty cards is work nobody sees.
 *
 * LOOPING IS ARITHMETIC, not cloned nodes: the distance from centre is folded
 * into the shorter way round the ring, so a card leaves one edge and arrives at
 * the other without anything being inserted or removed.
 *
 * THE RAKE EASES OFF with distance rather than growing linearly. A linear ramp
 * folds the second card shut; this keeps it readable while the far ones still
 * recede.
 */
export function Coverflow({
  covers,
  onSelect,
  label = "Apps we have read",
  className,
}: {
  covers: Cover[];
  onSelect?: (index: number) => void;
  label?: string;
  className?: string;
}) {
  const count = covers.length;
  const frameRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const posRef = useRef(0);
  /** Where the current glide is headed. Stepping off `pos` instead would
   *  swallow a keypress that lands mid-flight. */
  const targetRef = useRef(0);
  const widthRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ id: number; x: number; pos: number; v: number; t: number } | null>(null);
  const [selected, setSelected] = useState(0);

  const indexAt = useCallback((pos: number) => ((Math.round(pos) % count) + count) % count, [count]);

  const paint = useCallback(() => {
    const width = widthRef.current;
    if (!width) return;
    const pitch = width * 1.06;
    const pos = posRef.current;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;
      let offset = index - pos;
      offset = ((offset % count) + count) % count;
      if (offset > count / 2) offset -= count;

      const distance = Math.abs(offset);
      const ramp = Math.pow(distance, 0.56);
      const tilt = Math.min(46 * ramp, 78) * Math.sign(offset);

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) translateZ(${-0.6 * width * ramp}px) rotateY(${-tilt}deg)`;
      /* A card is teleported across the ring at exactly half a turn out, so it
         has to have faded by then or the jump is visible. */
      const edge = Math.min(1, Math.max(0, count / 2 - distance));
      card.style.opacity = String(Math.max(0, 1 - 0.14 * distance) * edge);
      card.style.zIndex = String(100 - Math.round(distance));
    });
  }, [count]);

  const settle = useCallback(
    (target: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      targetRef.current = target;
      const i = indexAt(target);
      setSelected(i);
      onSelect?.(i);

      const step = () => {
        const remaining = target - posRef.current;
        if (Math.abs(remaining) < 0.0004) {
          posRef.current = target;
          paint();
          rafRef.current = null;
          return;
        }
        posRef.current += remaining * 0.16;
        paint();
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [indexAt, onSelect, paint],
  );

  const goTo = useCallback(
    (index: number) => settle(index + Math.round((targetRef.current - index) / count) * count),
    [count, settle],
  );
  const nudge = useCallback((by: number) => settle(Math.round(targetRef.current) + by), [settle]);

  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const card = cardRefs.current[0];
      if (!card) return;
      widthRef.current = card.offsetWidth;
      paint();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [paint]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className={cn("w-full", className)} role="region" aria-roledescription="carousel" aria-label={label}>
      <div className="relative">
        <div
          ref={frameRef}
          tabIndex={0}
          onPointerDown={(e) => {
            if (rafRef.current !== null) {
              cancelAnimationFrame(rafRef.current);
              rafRef.current = null;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            targetRef.current = posRef.current;
            dragRef.current = { id: e.pointerId, x: e.clientX, pos: posRef.current, v: 0, t: performance.now() };
          }}
          onPointerMove={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.id !== e.pointerId) return;
            const pitch = widthRef.current * 1.06;
            if (!pitch) return;
            const now = performance.now();
            const previous = posRef.current;
            posRef.current = drag.pos - (e.clientX - drag.x) / pitch;
            drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000;
            drag.t = now;
            const i = indexAt(posRef.current);
            if (i !== selected) {
              setSelected(i);
              onSelect?.(i);
            }
            paint();
          }}
          onPointerUp={(e) => {
            const drag = dragRef.current;
            if (!drag || drag.id !== e.pointerId) return;
            dragRef.current = null;
            /* Let a flick carry, but never more than two cards. */
            settle(Math.round(posRef.current + Math.max(-2, Math.min(2, drag.v * 0.18))));
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              nudge(-1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              nudge(1);
            }
          }}
          className="cursor-grab overflow-hidden py-7 outline-none focus-visible:ring-2 focus-visible:ring-link active:cursor-grabbing"
          style={{
            perspective: "calc(var(--cover) * 3)",
            /* Horizontal drag is ours; the page keeps vertical scrolling. */
            touchAction: "pan-y",
          }}
        >
          <div className="relative select-none" style={{ height: "var(--cover)", transformStyle: "preserve-3d" }}>
            {covers.map((c, index) => (
              <div
                key={c.id}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${c.alt} — ${index + 1} of ${count}`}
                onClick={() => goTo(index)}
                className="absolute top-0 left-1/2 aspect-square overflow-hidden rounded-[22%] border border-rule bg-surface shadow-xl will-change-transform"
                style={{ width: "var(--cover)" }}
              >
                {c.src && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.src} alt="" draggable={false} className="h-full w-full select-none object-cover" />
                )}
              </div>
            ))}
          </div>
        </div>

        {[-1, 1].map((dir) => (
          <button
            key={dir}
            type="button"
            aria-label={dir < 0 ? "Previous app" : "Next app"}
            onClick={() => nudge(dir)}
            className={cn(
              "absolute top-1/2 z-[200] -translate-y-1/2 rounded-full border border-rule bg-ground/80 px-2.5 py-1.5 text-[13px] backdrop-blur transition hover:border-ink",
              dir < 0 ? "left-1" : "right-1",
            )}
          >
            {dir < 0 ? "‹" : "›"}
          </button>
        ))}
      </div>
    </div>
  );
}
