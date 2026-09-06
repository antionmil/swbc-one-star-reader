"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Key = "rated" | "score" | "complaints";

const CHIPS: { key: Key; label: string }[] = [
  { key: "rated", label: "most rated" },
  { key: "complaints", label: "most complaints" },
  { key: "score", label: "lowest score" },
];

/**
 * Sorting without re-rendering anything.
 *
 * The rows are server-rendered — icons, complaints, quotes and all — and this
 * only reorders them, by setting `order` on each flex child from the numbers
 * the server already put in their data attributes. Passing all of that content
 * through a client component as data instead would roughly double the weight
 * of the page to move twenty rows around.
 */
export function AppShelf({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState<Key>("rated");

  useEffect(() => {
    const items = Array.from(ref.current?.children ?? []) as HTMLElement[];
    const value = (el: HTMLElement) => Number(el.dataset[key] ?? 0);
    /* Score sorts upward — "lowest score" means the worst-rated first. The
       other two sort downward. */
    const sorted = [...items].sort((a, b) => (key === "score" ? value(a) - value(b) : value(b) - value(a)));
    sorted.forEach((el, i) => {
      el.style.order = String(i);
    });
  }, [key]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.14em] text-faint uppercase">sort</span>
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={key === c.key}
            onClick={() => setKey(c.key)}
            className={cn(
              "rounded-full border px-3 py-1 font-mono text-[11px] transition",
              key === c.key
                ? "border-transparent bg-ink text-ground"
                : "border-rule text-muted hover:border-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div ref={ref} className="mt-3 flex flex-col border-t border-rule">
        {children}
      </div>
    </>
  );
}
