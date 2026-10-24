"use client";

// Adapted from Magic UI's Text Highlighter (magicui.design/docs/components/highlighter).
// Changes per DESIGN.md: one quick stroke in CBT blue wash; only re-measures its own
// text and redraws without animation (the original re-animated every highlight on
// any page resize); a plain <mark> under reduced motion.
import { useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { annotate } from "rough-notation";

const COLOR = "#d6e1fa"; // ≈ CBT Blue Wash, strong enough to see behind text

export function Highlighter({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (reduce || !el) return;
    const make = (animate: boolean) => {
      const a = annotate(el, { type: "highlight", color: COLOR, iterations: 1, animationDuration: 250, padding: 1, multiline: true, animate });
      a.show();
      return a;
    };
    let annotation = make(true);
    const observer = new ResizeObserver(() => {
      annotation.remove();
      annotation = make(false);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      annotation.remove();
    };
  }, [reduce]);

  if (reduce) return <mark style={{ background: COLOR, color: "inherit", borderRadius: 2 }}>{children}</mark>;
  // rough-notation inserts its drawing next to the marked text. The wrapper
  // gives that drawing a positioned parent inside the cell, so the sheet's
  // scroll area clips it, and `.cbt-highlight` layers it behind the text.
  return (
    <span className="cbt-highlight">
      <span ref={ref}>{children}</span>
    </span>
  );
}
